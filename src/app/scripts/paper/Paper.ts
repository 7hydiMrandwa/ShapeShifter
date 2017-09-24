import { ToolMode } from 'app/model/paper';
import { PaperLayer } from 'app/scripts/paper/item';
import { PaperService } from 'app/services';
import {
  getHiddenLayerIds,
  getHoveredLayerId,
  getSelectedLayerIds,
  getVectorLayer,
} from 'app/store/layers/selectors';
import {
  getFocusedPathInfo,
  getPathOverlayInfo,
  getSelectionBox,
  getSnapGuideInfo,
  getTooltipInfo,
  getZoomPanInfo,
} from 'app/store/paper/selectors';
import { getToolMode } from 'app/store/paper/selectors';
import * as paper from 'paper';

import { Tool, newMasterTool, newZoomPanTool } from './tool';

// By default paper.js bakes matrix transformations directly into its children.
// This is usually not the behavior we want (especially for groups).
paper.settings.applyMatrix = false;

// By default paper.js automatically inserts newly created items into the active layer.
// This behavior makes it harder to explicitly position things in the item hierarchy.
paper.settings.insertItems = false;

// TODO: make it possible to deactivate/destroy an active paper.js project
let paperLayer: PaperLayer;

/**
 * Note that this must be called after the DOM has been initialized
 * (i.e. in an ngAfterViewInit callback).
 */
export function initialize(canvas: HTMLCanvasElement, paperService: PaperService) {
  if (paperLayer) {
    throw new Error('A project already exists for the provided canvas!');
  }
  initializeCanvas(canvas);
  initializeTools(paperService);
  initializeListeners(paperService);
}

function initializeCanvas(canvas: HTMLCanvasElement) {
  paper.setup(canvas);
  paperLayer = new PaperLayer();
  paper.project.addLayer(paperLayer);
}

function initializeTools(ps: PaperService) {
  const paperTool = new paper.Tool();
  const masterTool = newMasterTool(ps);
  const zoomPanTool = newZoomPanTool(ps);
  let currentTool: Tool;

  const onEventFn = (event?: paper.ToolEvent | paper.KeyEvent) => {
    const prevTool = currentTool;
    currentTool =
      ps.getToolMode() === ToolMode.ZoomPan || (event && event.modifiers.space)
        ? zoomPanTool
        : masterTool;
    if (prevTool !== currentTool) {
      if (prevTool) {
        prevTool.onDeactivate();
      }
      if (currentTool) {
        currentTool.onActivate();
      }
    }
    if (currentTool) {
      if (event instanceof paper.ToolEvent) {
        currentTool.onMouseEvent(event);
      } else if (event instanceof paper.KeyEvent) {
        currentTool.onKeyEvent(event);
      }
    }
  };

  ps.store.select(getToolMode).subscribe(toolMode => {
    // TODO: clean this fixed distance code up?
    // TODO: should the '4' here be in terms of physical pixels or viewport pixels?
    paperTool.fixedDistance = toolMode === ToolMode.Pencil ? 4 : undefined;
    onEventFn();
  });

  paperTool.on({
    mousedown: onEventFn,
    mousedrag: onEventFn,
    mousemove: onEventFn,
    mouseup: onEventFn,
    keydown: onEventFn,
    keyup: onEventFn,
  });
}

function initializeListeners(ps: PaperService) {
  const pl = paperLayer;
  ps.store.select(getVectorLayer).subscribe(vl => pl.setVectorLayer(vl));
  ps.store.select(getSelectedLayerIds).subscribe(ids => pl.setSelectedLayers(ids));
  ps.store.select(getHoveredLayerId).subscribe(id => pl.setHoveredLayer(id));
  ps.store.select(getPathOverlayInfo).subscribe(info => pl.setPathOverlayInfo(info));
  ps.store.select(getFocusedPathInfo).subscribe(info => pl.setFocusedPathInfo(info));
  ps.store.select(getSnapGuideInfo).subscribe(info => pl.setSnapGuideInfo(info));
  ps.store.select(getHiddenLayerIds).subscribe(ids => pl.setHiddenLayers(ids));
  ps.store.select(getTooltipInfo).subscribe(info => pl.setTooltipInfo(info));
  ps.store.select(getSelectionBox).subscribe(box => {
    if (box) {
      const from = new paper.Point(box.from);
      const to = new paper.Point(box.to);
      pl.setSelectionBox({ from, to });
    } else {
      pl.setSelectionBox(undefined);
    }
  });
  ps.store.select(getZoomPanInfo).subscribe(({ zoom, translation: { tx, ty } }) => {
    paper.view.matrix = new paper.Matrix(zoom, 0, 0, zoom, tx, ty);
  });
}

/**
 * Update the project's dimensions with the new VectorLayer viewport
 * and/or canvas element size.
 */
export function updateDimensions(
  viewportWidth: number,
  viewportHeight: number,
  viewWidth: number,
  viewHeight: number,
) {
  // The view size represents the actual size of the canvas in CSS pixels.
  // The viewport size represents the user-visible dimensions (i.e. the default 24x24).
  paper.view.viewSize = new paper.Size(viewWidth, viewHeight);
  paperLayer.setDimensions(viewportWidth, viewportHeight, viewWidth, viewHeight);
}
