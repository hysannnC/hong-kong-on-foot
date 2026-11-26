import {routes} from './learning.mjs';

// Fictional observations change the route cost, without modifying the earlier pilot data.
export function selectRoute(history, blocked = '') {
  return routes.filter(route => route.stepFree && route.id !== blocked).sort((a, b) => {
    const cost = route => {
      const count = history[route.id] || 0;
      return route.minutes + 9 * count / (count + 2);
    };
    return cost(a) - cost(b);
  })[0];
}

export function cameraSignals(detections, width, height) {
  const vehicles = new Set(['car','truck','bus','motorcycle','bicycle']);
  const obstacles = new Set(['chair','bench','suitcase','backpack','potted plant',...vehicles]);
  const center = ([x,y,w,h]) => x < width*.62 && x+w > width*.38 && y+h > height*.60 && w*h > width*height*.035;
  return {
    people:detections.filter(item=>item.class==='person').length,
    vehicles:detections.filter(item=>vehicles.has(item.class)).length,
    obstacle:detections.some(item=>obstacles.has(item.class) && center(item.bbox)),
  };
}
