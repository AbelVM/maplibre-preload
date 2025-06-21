# maplibre-preload

A tiny (1 kB gziped) almost-zero-configuration plugin for preloading tiles and smoothen the experience when using targeted movements in [MapLibreGL JS](https://maplibre.org/).

## Demo

[https://abelvm.github.io/maplibre-preload/example/](https://abelvm.github.io/maplibre-preload/example/)

You may want to check the `network` tab at develover console to check the cache hits.

## Motivation

It started [here](https://github.com/maplibre/maplibre-gl-js/issues/116), a conversation about the need of precaching tiles when the user start a movement, and as one the reference mentioned there was [MapWorkBox](https://github.com/AbelVM/mapworkbox), a little PoC I built for testing preemptive tiles caching using `Service Workers`.

So, the idea is to smooth the rendering of the animation frames of the camera and final scenario when using (animated) targeted movements map methods (`panTo`, `zoomTo`, `easeTo` and `flyTo`).

The MapLibre GL JS requests new tiles as the camera view changes during the animation, and maybe batch-preloading the tiles of the final scenario, the final animation transition might look way better.

## Features

As of today, this plugin offers the next features:

* It hijacks the old methods and adds the pre-load functionality in a transparent way.
* Full final scenario preload
* Full in-between animation scenarios preload
* Pitch & bearing management
* Limit the amount of server requests, lowering the priority of tiles at the viewport border if needed
* Cancelling requests management to avoid un-needed tiles if the movement has ended or new interactions are detected

## How to

First, just add the dependency `after` MapLibreGL JS.

Then, load the plugin in the `onload` event of your map

```javascript
map.on('load', () => {
  new MaplibrePreload(map, options);
});

```

Available options on instantiating the plugin:

| Parameter | Type | Default | Description |
|---|---|---|---|
| progressCallback | function({ loaded, total, failed }) | null | Callback function to be called per tile preload, mainly for debugging purposes |
| async | boolean | true | Tells the plugin whether to wait for the full preload before triggering the movement|
| burstLimit | integer | 200 | Soft limit for the number of tiles preloaded during the animation |

Example:

```javascript
map.on('load', () => {
    new MaplibrePreload(map, {
        progressCallback: ({ loaded, total, failed }) => {
            console.log(`Preloading tiles: ${loaded}/${total} loaded, ${failed} failed`);
        },
        burstLimit: 250
    });
});

```

Then, you can call `panTo`, `zoomTo`, `easeTo` or `flyTo` in the old way, and the tiles will pre preloaded without further coding.

Some notes on the side effects of the common options of those functions:

| Parameter | Effect |
|---|---|
| animate | If set to `false`, no preload is performed |
| duration | The preload time limit is set to `5 * duration` for each run |

### Changelog

* **v 1.0.0**
  * [Feature] Fully rewritten
  * [Feature] Full support for in-between animation frames scenarios
  * [Feature] Full support of actual `flyTo` camera path during animation
  * [Feature] Pitch and bearing are taken into account for each frame
  * [Feature] The higher the pitch, the lower priority is given to far tiles
  * [Feature] If the amount of tiles in a given frame is bigger than `burstLimit`, the tiles far from the center are dropped till the limit is met
  * [Feature] Pending requests are canceled if the movement has ended, the time limit is met or a new movement is started
* **v 0.0.1**
  * [Feature] Upgraded to work with MapLibre 5.6.0
  * [Feature] Updated dependencies
  * [Feature] Working example as gh-page
* **v 0.0.0b**
  * [Fix] Return the map object in the `cached__To` methods to keep the original output
  * [Fix] Use the [Bresenham algorithm](https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm) to preload only the tiles in the start -> end path instead of all the tiles in the bounding box defined by those two points
  * [Feature] Add a `run` flag to allow preloading with/without running the actual `___To` map methods. Intended to enable the preload of the movement when we can expect the animation later (v.g.: preload when hovering a button, flyTo when clicking)
  * [Feature] Hide log messages behind a `debug` flag (boolean, default `false`)
* **v 0.0.0a**
  * Initial release

### To Do

* Because of [this issue](https://github.com/maplibre/maplibre-gl-js/issues/6041), there is no way to take advantage of the own MapLibre GL JS tiles and cache management, so I needed to fall back to `fetch` logic and rely on the browser cache.
