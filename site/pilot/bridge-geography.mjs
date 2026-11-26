// OpenStreetMap ways 1356576713, 311799415, 1481059296, 1481059298,
// 1481059295, 1481059294, 1356808099, 1481059299, 1481059300,
// 1481059257 and 1481059304. The crossing between the two terminal
// corridors stays within the mapped covered circulation area (1481059312).
export const approach=[
  [22.2825245,114.1583475],[22.2830318,114.1586948],[22.2831424,114.1587701],
  [22.2832707,114.1588554],[22.2833564,114.1589129],[22.2836676,114.1591127],
  [22.2839502,114.1592957],[22.2839815,114.1593179],[22.283973,114.1593319],
  [22.2839607,114.1593523],[22.2839134,114.1594304],[22.2838861,114.1594754],
  [22.2838779,114.159493],[22.2838659,114.1595193],[22.2838595,114.1595394],
  [22.283853,114.1595639],[22.283846,114.1595929],[22.2838666,114.1596584],
  [22.2838935,114.1597193],[22.2841036,114.1602179],[22.2841293,114.1602861],
  [22.284187,114.1603277],[22.2843303,114.1604124],[22.2858392,114.1608982],
  [22.2859186,114.1609428],
];
export const terminalLink=[
  approach.at(-1),[22.2863269,114.1611363],[22.2863467,114.1611457],
  [22.2863654,114.1611539],
];
export const pierAccess=[
  terminalLink.at(-1),[22.2865728,114.1609383],[22.2865914,114.1609453],
  [22.2867648,114.1610193],[22.2869147,114.1610842],
];
// The ramp and junction connections are drawn for the map scenario. The longer
// detour follows the landside paths around the east side of the terminal plaza.
export const exampleRamp=[
  [22.286156,114.161102],[22.286225,114.161145],[22.286214,114.161169],
  [22.286142,114.161125],[22.286130,114.161153],[22.286188,114.161191],
  [22.286240,114.161244],
];
export const exampleDetour=[
  [22.286279,114.161373],[22.286112,114.161814],[22.286185,114.161840],
  [22.286262,114.161875],[22.286347,114.161854],[22.286437,114.161757],
  [22.286655,114.161228],[22.286733,114.161028],
  ...pierAccess.slice(-2),
];
export const geographySources=[
  ['Central Yards replacement passageway','Central Yards 臨時行人通道','https://www.hld.com/en/our-news/press-releases/central-yards-new-temporary-pedestrian-passageway-to-open-on-19-february-enhancing-harbourfront-connectivity-with-24-hour-air-conditioning-and-artistic-features'],
  ['Mapped pedestrian links · OpenStreetMap','已繪製的行人通道 · OpenStreetMap','https://www.openstreetmap.org/way/1481059299'],
  ['Pier 7 terminal access plan · Annex B','七號碼頭通道圖 · 附件 B','https://www.hfc.org.hk/filemanager/files/TFHK_05_2023.pdf'],
];
