# Feature Specification: Semantic search anchor display

## Goal

Semantic-search results must present only the three ranked anchor nodes as the
answer. Bounded evidence nodes remain in the cluster so selecting a result can
load the supporting graph, but they must not look like additional ranked
answers.

## Requirements

- `ClusterNode` accepts the backend `anchor` and `evidence` roles.
- The result subtitle lists anchor names only, in response order.
- Legacy responses without roles continue to show at most the first three
  nodes.
- Evidence is summarized as a count and remains included in cluster selection.

