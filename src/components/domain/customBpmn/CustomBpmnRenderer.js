/**
 * CustomBpmnRenderer – process-gpt-vue3 색상 스키마를 적용한 BPMN 커스텀 렌더러
 *
 * 색상 요약:
 *  - Task:        fill #fdf2d0 (연한 노랑), 둥근 모서리 + 그림자
 *  - StartEvent:  fill #f6c745 (골드)
 *  - EndEvent:    fill #f6c745 (골드)
 *  - Gateway:     fill #fff, stroke #000, 그림자
 *  - SubProcess:  fill #fff, stroke #000, 둥근 모서리
 *  - Lane:        fill #f4f8fc, stroke #4e72be
 *  - Participant: fill #f4f8fc, stroke #4e72be
 *  - SequenceFlow: stroke black + custom arrow marker
 */
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';

import {
  append as svgAppend,
  attr as svgAttr,
  create as svgCreate,
  remove as svgRemove
} from 'tiny-svg';

import { getRoundRectPath } from 'bpmn-js/lib/draw/BpmnRenderUtil';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { isAny } from 'bpmn-js/lib/features/modeling/util/ModelingUtil';

const HIGH_PRIORITY = 1500;
const TASK_BORDER_RADIUS = 10;

// ─── Color constants ──────────────────────────────────────
const COLORS = {
  taskFill: '#fdf2d0',
  eventFill: '#f6c745',
  gatewayFill: '#ffffff',
  gatewayStroke: '#333333',
  subProcessFill: '#ffffff',
  subProcessStroke: '#333333',
  laneFill: '#f4f8fc',
  laneStroke: '#4e72be',
  sequenceFlowStroke: '#333333',
};

// ─── SVG helpers ──────────────────────────────────────────

let _shadowId = 0;

function addShadowFilter(parentNode) {
  const id = `dropshadow-${++_shadowId}`;
  const defs = svgCreate('defs');
  const filter = svgCreate('filter');
  const feDropShadow = svgCreate('feDropShadow');

  svgAttr(filter, { id, height: '130%' });
  svgAttr(feDropShadow, {
    dx: '1',
    dy: '1',
    stdDeviation: '3',
    'flood-opacity': '0.2',
  });

  svgAppend(filter, feDropShadow);
  svgAppend(defs, filter);
  svgAppend(parentNode, defs);

  return `url(#${id})`;
}

function drawRect(parentNode, width, height, borderRadius, strokeColor, fillColor, withShadow = true) {
  const rect = svgCreate('rect');
  const attrs = {
    width,
    height,
    rx: borderRadius,
    ry: borderRadius,
    stroke: strokeColor || 'none',
    'stroke-width': 2,
    fill: fillColor || '#fff',
  };

  if (withShadow) {
    attrs.filter = addShadowFilter(parentNode);
  }

  svgAttr(rect, attrs);
  svgAppend(parentNode, rect);
  return rect;
}

function drawPolygon(parentNode, points, withShadow = true) {
  const polygon = svgCreate('polygon');
  const attrs = { points };

  if (withShadow) {
    attrs.filter = addShadowFilter(parentNode);
  }

  svgAttr(polygon, attrs);
  svgAppend(parentNode, polygon);
  return polygon;
}

let _markerCount = 0;

function createCustomMarker(parentNode, color) {
  const markerId = `custom-arrow-${++_markerCount}`;
  const marker = svgCreate('marker');
  const path = svgCreate('path');

  svgAttr(marker, {
    id: markerId,
    viewBox: '0 0 10 10',
    refX: '9',
    refY: '5',
    markerWidth: '6',
    markerHeight: '6',
    orient: 'auto',
  });

  svgAttr(path, {
    d: 'M 0 0 L 10 5 L 0 10 z',
    fill: color,
  });

  svgAppend(marker, path);

  // Append to SVG defs
  let defs = parentNode.querySelector('defs');
  if (!defs) {
    defs = svgCreate('defs');
    svgAppend(parentNode, defs);
  }
  svgAppend(defs, marker);

  return `url(#${markerId})`;
}

function prependTo(newNode, parentNode, siblingNode) {
  parentNode.insertBefore(newNode, siblingNode || parentNode.firstChild);
}

function copyAttributes(source, target) {
  const attributes = source.attributes;
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    target.setAttribute(attr.name, attr.value);
  }
}

// ─── Renderer ─────────────────────────────────────────────

export default class CustomBpmnRenderer extends BaseRenderer {
  constructor(eventBus, bpmnRenderer) {
    super(eventBus, HIGH_PRIORITY);
    this.bpmnRenderer = bpmnRenderer;
  }

  canRender(element) {
    return (
      isAny(element, [
        'bpmn:Task',
        'bpmn:Lane',
        'bpmn:Participant',
        'bpmn:SequenceFlow',
        'bpmn:StartEvent',
        'bpmn:EndEvent',
        'bpmn:Gateway',
        'bpmn:SubProcess',
        'bpmn:CallActivity',
      ]) && !element.labelTarget
    );
  }

  drawShape(parentNode, element) {
    const shape = this.bpmnRenderer.drawShape(parentNode, element);

    if (is(element, 'bpmn:Task') || is(element, 'bpmn:CallActivity')) {
      this._drawTask(parentNode, shape, element);
    } else if (is(element, 'bpmn:StartEvent')) {
      this._drawEvent(parentNode, shape);
    } else if (is(element, 'bpmn:EndEvent')) {
      this._drawEvent(parentNode, shape);
    } else if (is(element, 'bpmn:Gateway')) {
      this._drawGateway(parentNode, shape);
    } else if (is(element, 'bpmn:SubProcess')) {
      this._drawSubProcess(parentNode, shape);
    } else if (is(element, 'bpmn:Lane')) {
      this._drawLane(parentNode, shape);
    } else if (is(element, 'bpmn:Participant')) {
      this._drawParticipant(parentNode, shape);
    }

    return shape;
  }

  drawConnection(parentNode, element) {
    if (is(element, 'bpmn:SequenceFlow')) {
      const strokeColor = COLORS.sequenceFlowStroke;
      const customMarkerUrl = createCustomMarker(parentNode, strokeColor);
      const options = {
        stroke: strokeColor,
        strokeWidth: '2',
        markerEnd: customMarkerUrl,
      };
      return this.bpmnRenderer.drawConnection(parentNode, element, options);
    }
    return this.bpmnRenderer.drawConnection(parentNode, element);
  }

  getShapePath(shape) {
    if (is(shape, 'bpmn:Task')) {
      return getRoundRectPath(shape, TASK_BORDER_RADIUS);
    }
    return this.bpmnRenderer.getShapePath(shape);
  }

  // ── Individual draw methods ──

  _drawTask(parentNode, shape, element) {
    const w = shape.width?.baseVal?.value ?? element.width ?? 100;
    const h = shape.height?.baseVal?.value ?? element.height ?? 80;

    const fillColor = COLORS.taskFill;

    const rect = drawRect(parentNode, w, h, TASK_BORDER_RADIUS, 'none', fillColor, true);
    prependTo(rect, parentNode);
    svgRemove(shape);
  }

  _drawEvent(parentNode, shape) {
    const size = 34;
    const radius = 100;

    const rect = drawRect(parentNode, size, size, radius, 'none', COLORS.eventFill, true);
    prependTo(rect, parentNode);
    svgRemove(shape);
  }

  _drawGateway(parentNode, shape) {
    let w, h;
    try {
      const bbox = shape.getBoundingClientRect();
      w = bbox.width;
      h = bbox.height;
    } catch {
      w = 50;
      h = 50;
    }

    const points = [
      `${w / 2},0`,
      `${w},${h / 2}`,
      `${w / 2},${h}`,
      `0,${h / 2}`,
    ].join(' ');

    const diamond = drawPolygon(parentNode, points, true);

    copyAttributes(shape, diamond);
    diamond.style.stroke = COLORS.gatewayStroke;
    diamond.style.strokeWidth = '2';
    diamond.style.fill = COLORS.gatewayFill;

    prependTo(diamond, parentNode);
    svgRemove(shape);
  }

  _drawSubProcess(parentNode, shape) {
    const w = shape.width?.baseVal?.value ?? 200;
    const h = shape.height?.baseVal?.value ?? 120;

    const rect = drawRect(parentNode, w, h, TASK_BORDER_RADIUS, COLORS.subProcessStroke, COLORS.subProcessFill, true);
    prependTo(rect, parentNode);
    svgRemove(shape);
  }

  _drawLane(parentNode, shape) {
    svgAttr(shape, {
      stroke: COLORS.laneStroke,
      'stroke-width': '1',
      fill: COLORS.laneFill,
    });
  }

  _drawParticipant(parentNode, shape) {
    svgAttr(shape, {
      stroke: COLORS.laneStroke,
      fill: COLORS.laneFill,
    });
  }
}

CustomBpmnRenderer.$inject = ['eventBus', 'bpmnRenderer'];
