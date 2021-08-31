# maplibre-preload

A tiny (5.53 kB gziped) zero-configuration plugin for preloading tiles and smoothen the experience when using targeted movements in [MapLibreGL JS](https://maplibre.org/).

## Why?

It started [here](https://github.com/maplibre/maplibre-gl-js/issues/116), a conversation about the need of precaching tiles when the user start a movement, and as one the reference mentioned there was [MapWorkBox](https://github.com/AbelVM/mapworkbox), a little PoC I built for testing preemptive tiles caching using `Service Workers`.

So, the idea is to smooth the rendering of the animation frames of the camera and final scenario when using targeted movements map methods (`panTo`, `zoomTo`, `jumpTo`, `easeTo` and `flyTo`). The standard applications request new tiles as they change the camera view during the animation, and maybe batch-preloading the tiles of the final scenarion, the final animation transition might look way better.

## How
This little pluging make use of inline `webworkers` to preload the tiles, so it is not run in the main thread. As of today, this plugin offers the next features:

* Full final scenario preload
* Partial inbetween animation preload

It adds precached map methods to the old ones:

* **cachedPanTo**
* **cachedZoomTo**
* **cachedJumpTo**
* **cachedEaseTo**
* **cachedFlyTo** 

With the same signature than the original methods, but the `run` flag (boolean, default `false`) to trigger the original methods or just preload the tiles for future use.

### Changelog

* **v0.0.2**
  * [Fix] Return the map object in the `cached__To` methods to keep the original output
  * [Fix] Use the [Bresenham algorithm](https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm) to preload only the tiles in the start -> end path instead of all the tiles in the bounding box defined by those two points
  * [Feature] Add a `run` flag to allow preloading with/without running the actual `___To` map methods. Intended to enable the preload of the movement when we can expect the animation later (v.g.: preload when hovering a button, flyTo when clicking)
  * [Feature] Hide log messages behind a `debug` flag (boolean, default `false`)
* **v0.0.1** 
  * Initial release
### To Do

* Add `bearing` and `pitch` logic.
* Improve the management of zoom levels while the animation, as it is not a constant `zmin` value

### How to use

```bash
npm install
npm run build
```

And you will find several versions of the library at `/dist` (more info at [Microbundle](https://github.com/developit/microbundle))

* `maplibre-preload.cjs`: CommonJS bundle
* `maplibre-preload.module.js`: ESM bundle
* `maplibre-preload.modern.js`: Designed to work in all modern browsers, generally smaller and faster to execute than the plain ESM bundle.

You can find a simple example [here](example/index.html), run it in a local server and check the dev console to watch how the map hits the cache for all the cached tiles, giving the render engine an estimated extra time of 

`0.9 * single_tile_loading_time * num_of_tiles_in_final_scenario / 6`

(as per my simple benchmarks)

### Caveats and final thoughts

Workers comply with the global max number of connections per host name (typically 6 while using HTTP1.1, with HTTP2... will see), so preloading will always interfere with standard requestes made by `panTo`, `zoomTo`, `jumpTo`, `easeTo` or `flyTo`. So, those expected requests are queued while the prefetch requests are resolved, eventually leading to rendering glitches as the animation goes on but there is no data to render. That can be easily analyzed checking the waterfall in the network panel of the dev console.

With optimal network conditions, the above issue is almost unnoticeable because, while the animation takes ~ 5000ms, it takes ~ 400ms to preload all the tiles, and then, retrieveing each tile from cache takes like ~ 5ms per batch of 6. 

This being said, prefetching needs an extra-fine tuning to select the right amount of tiles to be preloaded, maybe just the final scenario. Or maybe it just doesn't make sense at all. I'd love to hear about use cases where the pros outweigh the cons.