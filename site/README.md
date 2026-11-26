# Hong Kong on Foot 2.0

Open the Study 2.0 link from the original map for a guided Central MTR–IFC demonstration.

Serve this folder with Python using `python3 -m http.server 8765 --bind 127.0.0.1`. Open http://127.0.0.1:8765/pilot/.

The one-minute demo illustrates acceleration, phone rotation and GPS signals during a pause and backtrack. One optional answer after the walk informs a planner recommendation. Photos can be attached using the device camera or image picker, previewed and removed.

Try with my phone requests motion and location access. Available samples support experimental quiet-motion and GPS backtrack detection. Rotation samples are counted. Device support varies and requires HTTPS or localhost. Keep the page visible and the screen on. Hidden-page intervals are marked as gaps. The session and selected photo stay in memory, with no shared backend. Reloading or resetting discards them.

The demo uses simulated signals and rule-based recommendations. Automatic image interpretation, reliable activity recognition, floor detection, field validation and continuous background recording need further development. A sample study pin can be previewed on the original map for a suggested sign or access check.

The earlier planner analysis code remains in the pilot folder for future reuse, while the public study entry point uses the guided experience.

   
After the demo walk, select **Compare routes and learn** to overlay the original suggested path, a simulated or recorded actual path, and fictional community paths. Three batches of fictional completed walks update online time and independent-passage estimates. Learning progress is saved locally in the browser. A step-free toggle excludes the fictional stairs connection before ranking. This demonstration uses online statistical estimates, with simulated access attributes and no shared model or participant backend. Live GPS accuracy and gaps affect the recorded path.

The **Camera walking pilot** opens from Study 2.0 or at http://127.0.0.1:8765/pilot/ar.html. Play the field scenario to see automatic obstruction detection, a detour and a change in the next route recommendation. The scenario uses illustrative routes and saves fictional blockage counts in the browser. Reset sample learning to replay from the initial recommendation.

Live camera mode needs camera permission, an HTTPS origin or localhost, and an internet connection to load the COCO-SSD model. The browser runs the detector locally and counts visible people and vehicles and flags repeated foreground objects. A compass and good GPS fix near the pilot corridor enable an on-screen reference arrow. It is a heading overlay without street-surface anchoring. Route width, traffic danger and wheelchair clearance require field calibration. Live observations are held only for the session.

The **Star Ferry AR walkthrough** plays full viewport archival photographs of the IFC footbridge and Central Pier 7, or a local walking video selected by the viewer. The route line and arrow positions are calibrated per bundled image; the video overlay assumes a forward-facing clip. The video remains local. At the end, successful COCO-SSD readings update the browser's estimate of busy frames and compare illustrative route costs for different mobility profiles. Replays of the same source are counted once. The wheelchair profile requires verified access information before any route can be recommended.

Bundled photographs are resized. In-app credits link to the Wikimedia Commons originals and license details. The linked YouTube walk is external reference footage.

The **3D footbridge walkthrough** at `pilot/bridge.html` ends at 0:29 as the rider reaches the simulated ramp entrance. It renders the rider's surroundings and a separate phone camera view, with AR guidance drawn inside the phone. The ending opens a mobile-friendly public trip summary with an opt-in route comparison and a link to planner evidence inside the 1.0 map. The map uses the mapped Central Yards replacement passageway and ends at Pier 7's upper entrance. Simulated movements are aligned to the last mapped bridge segment. The fictional lift and unverified ramp continuation are omitted as geographic links. Planner evidence shows the source, confidence, segment identifier, and applicable closure window. Sample progress is local to the browser, and the ordinary walking network does not ingest fictional observations. The optional live camera pilot can show supported motion signals, which stay on-device for the session.
   
The lift tower design draws on the supplied photo and Hong Kong [Highways Department references for lift towers connected by covered links](https://www.hyd.gov.hk/en/our_projects/walkability_projects/UA/hy2022_12/index.html).

The Maya, Sam, Harper and Jordan characters are CC0 Innerscene assets adapted from MakeHuman. Their texture sizes were reduced for browser playback. The fixed-frame 90 fps exporter uses WebCodecs and mp4-muxer on browsers that support it, with real-time recording as a fallback.

- [Maya](https://www.innerscene.com/tools/library/3d-parts/relaxed-walk-maya-3d-person-animated-2c6669a2)
- [Sam](https://www.innerscene.com/tools/library/3d-parts/relaxed-walk-sam-3d-person-animated-732f1206)
- [Harper](https://www.innerscene.com/tools/library/3d-parts/relaxed-walk-harper-3d-person-animated-b504cbac)
- [Jordan](https://www.innerscene.com/tools/library/3d-parts/locomotion-collection-jordan-3d-person-animated-911f1584)

## Consolidated public map

Published at https://hysannnc.github.io/hong-kong-on-foot/ using the existing GitHub Pages workflow. The complete static site lives under `site/` in the GitHub repository. No ChatGPT or GitHub account is needed to view it.

The public map provides Explore, Directions and AR walk. Planner mode provides Accessibility (walking coverage and trip analysis) and Street study (crowd flow, camera replay and street observations). Public and planner route comparisons share the Central Market–Hong Kong Station example, observation symbols and evidence records. Original routes are solid green and evidence-based alternatives are dashed orange.

The AR demonstration shows a wheelchair journey, a crowd detour and a lift closure leading to a U-turn towards a ramp. Supported live camera, accelerometer, gyroscope and GPS sensing requires explicit device permission and HTTPS. End-of-trip summaries link back to the public map and detailed planner analysis.

Saved AR trips include twelve explicitly fictional community traces distributed across Central. Their route colours blend from green (normal movement) through orange (slowing) to red (stopped), with green start and red end markers. Fictional camera captures, timestamps and observations illustrate how community evidence could inform planning. Charts and exports respect the selected trip, route and data source.

Street study uses the mapped Central pedestrian network and illustrative hourly crowd demand. Camera replay presents four annotated cases: facility interruption, water on access routes, crossing conflicts and recurring footway blockage. Archived photographs substitute for CCTV inputs; credits identify each original capture location. Camera locations, evidence rules, mapped results and follow-up actions can be explored step by step. Crowd-load percentages use illustrative width and capacity assumptions, not measured occupancy or validated engineering assessments.

This is a proof of concept. Replay observations, synthetic trip data and rules do not constitute a trained AI model or a live CCTV feed. Sensor cues cannot establish why someone stopped or confirm accessibility. Planner recommendations require field checks and verified facility status.

The public archive bundles 13 approved illustrative trip records, their mapped routes, sensor summaries and available camera observations. Every visitor can view them and download `pilot/published-trip-records.json`. Additional trips recorded after publication use browser-local storage until explicitly exported and republished; there is no live shared participant database. Raw-data exports expose available records and aggregate sensor summaries, not raw camera streams. Publishing the code does not upload private local trip records or turn local storage into a shared backend.
