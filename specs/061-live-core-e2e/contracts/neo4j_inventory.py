from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

from neo4j import GraphDatabase


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def json_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, (list, tuple)):
        return [json_value(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): json_value(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    return str(value)


def digest(value: Any) -> str:
    payload = json.dumps(
        json_value(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def collect_inventory(env_path: Path, database: str) -> dict[str, Any]:
    env = read_env(env_path)
    if database != "neo4j":
        raise RuntimeError(f"Expected database='neo4j', got {database!r}")

    driver = GraphDatabase.driver(
        env["ROBO_NEO4J_URI"],
        auth=(env["ROBO_NEO4J_USER"], env["ROBO_NEO4J_PASSWORD"]),
    )
    try:
        with driver.session(database=database) as session:
            counts = session.run(
                "MATCH (n) "
                "WITH count(n) AS nodes "
                "OPTIONAL MATCH ()-[r]->() "
                "RETURN nodes, count(r) AS relationships"
            ).single()
            labels = [
                {"label": record["label"], "count": record["count"]}
                for record in session.run(
                    "MATCH (n) UNWIND labels(n) AS label "
                    "RETURN label, count(*) AS count ORDER BY label"
                )
            ]
            relationship_types = [
                {"type": record["type"], "count": record["count"]}
                for record in session.run(
                    "MATCH ()-[r]->() "
                    "RETURN type(r) AS type, count(*) AS count ORDER BY type"
                )
            ]
            nodes = [
                {
                    "key": record["key"],
                    "labels": sorted(record["labels"]),
                    "properties": json_value(record["properties"]),
                }
                for record in session.run(
                    "MATCH (n) "
                    "RETURN coalesce(toString(n.id), elementId(n)) AS key, "
                    "labels(n) AS labels, properties(n) AS properties "
                    "ORDER BY key"
                )
            ]
            relationships = [
                {
                    "source": record["source"],
                    "target": record["target"],
                    "type": record["type"],
                    "properties": json_value(record["properties"]),
                }
                for record in session.run(
                    "MATCH (source)-[r]->(target) "
                    "RETURN coalesce(toString(source.id), elementId(source)) AS source, "
                    "coalesce(toString(target.id), elementId(target)) AS target, "
                    "type(r) AS type, properties(r) AS properties "
                    "ORDER BY source, type, target"
                )
            ]
    finally:
        driver.close()

    return {
        "database": database,
        "nodes": int(counts["nodes"]),
        "relationships": int(counts["relationships"]),
        "labels": labels,
        "relationshipTypes": relationship_types,
        "nodeFingerprint": digest(nodes),
        "relationshipFingerprint": digest(relationships),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", required=True, type=Path)
    parser.add_argument("--database", required=True)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--require-empty", action="store_true")
    args = parser.parse_args()

    inventory = collect_inventory(args.env.resolve(), args.database)
    if args.require_empty and (
        inventory["nodes"] != 0 or inventory["relationships"] != 0
    ):
        raise RuntimeError(f"Neo4j is not empty: {inventory}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"inventory database={inventory['database']} "
        f"nodes={inventory['nodes']} relationships={inventory['relationships']}"
    )


if __name__ == "__main__":
    main()
