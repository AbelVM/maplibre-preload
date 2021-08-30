/*jshint esversion:11 */
import * as tilebelt from '@mapbox/tilebelt';
import { bounds } from '@mapbox/geo-viewport';
import ErrorStackParser from 'error-stack-parser';
import Point from '@mapbox/point-geometry';
const _lib = globalThis.maplibregl;

// run only in the main thread
if (_lib !== undefined) {
    /*

    Map methods

    */
    const cachedpanto = function (lnglat, options) {
        const o = Object.assign({}, options, { type: 'pan', center: lnglat }, this._context(options));
        this._precache(o);
        this.panTo(point, options);
    };
    _lib.Map.prototype.cachedPanTo = cachedpanto;

    const cachedzoomto = function (zoom, options) {
        const o = Object.assign({}, options, { type: 'zoom', zoom: zoom }, this._context(options));
        this._precache(o);
        this.zoomTo(zoom, options);
    };
    _lib.Map.prototype.cachedZoomTo = cachedzoomto;

    const cachedjumpto = function (options) {
        const o = Object.assign({}, options, { type: 'jump' }, this._context(options));
        this._precache(o);
        this.jumpTo(o);
    };
    _lib.Map.prototype.cachedJumpTo = cachedjumpto;

    const cachedeaseto = function (options) {
        const o = Object.assign({}, options, { type: 'ease' }, this._context(options));
        this._precache(o);
        this.easeTo(o);
    };
    _lib.Map.prototype.cachedEaseTo = cachedeaseto;

    const cachedflyto = function (options) {
        // FIXME: lazy hack
        options.type = 'fly';
        const o = Object.assign({}, options, { type: 'fly' }, this._context(options));
        this._precache(o);
        this.flyTo(o);
    };
    _lib.Map.prototype.cachedFlyTo = cachedflyto;
    /*
    
        Logic
    
    */
    // Gets the needed information related to the Map object
    const _context = function (options) {
        // Only the tiled sources are needed
        const _sources = Object.entries(this.getStyle().sources)
            .filter(s => ['vector', 'raster'].indexOf(s[1].type) > -1 && (s[1].url !== undefined || s[1].tiles !== undefined))
            .map(s => this.getSource(s[0]).tiles[0]);
        const _dimensions = [this.getCanvas().width, this.getCanvas().height];
        const _tilesize = this.transform.tileSize;
        const sc = this.getCenter();
        let zmin = Math.min(this.getZoom(), options.zoom);
        if (options.type == 'fly') {
            // From the flyTo logic itself
            const offsetAsPoint = Point.convert(options.offset || [0, 0]);
            let pointAtOffset = this.transform.centerPoint.add(offsetAsPoint);
            const locationAtOffset = this.transform.pointLocation(pointAtOffset);
            const center = new _lib.LngLat(...options.center);
            this._normalizeCenter(center);
            const from = this.transform.project(locationAtOffset);
            const delta = this.transform.project(center).sub(from);
            const rho = options.curve || 1.42;
            const u1 = delta.mag();
            const wmax = 2 * rho * rho * u1;
            const zd = this.getZoom() + this.transform.scaleZoom(1 / wmax);
            zmin = Math.floor(Math.max(Math.min(zmin + zd, options.minZoom || zmin + zd), 0));
        }
        return {
            sources: _sources,
            dimensions: _dimensions,
            tilesize: _tilesize,
            startCenter: [sc.lng, sc.lat],
            startZoom: this.getZoom(),
            zmin: zmin
        };
    };
    _lib.Map.prototype._context = _context;
    // build and manage the preloader worker
    const precache_run = function (o) {
        if (window === self && this.precache_worker == undefined) {
            // the actual absolute path of the running script
            // as the module-typed workers are only supported by Chrome
            const _imported = ErrorStackParser.parse(new Error('BOOM'))[0].fileName;
            // build inline worker
            const target = `
            importScripts('${_imported}');
            let controller;
            let signal;
            onmessage = function (o){
                if (controller !== undefined && controller.signal !== undefined && !controller.signal.aborted){
                    controller.abort();               
                }
                if (o.data.abort){
                    postMessage({t: Date.now(), e: true});
                    return;
                }
                controller = new AbortController();
                signal = controller.signal;     
                let _func = ${precache_function.toString()};
                _func.apply(null, [o.data]);
            }`;
            const mission = URL.createObjectURL(new Blob([target], { 'type': 'text/javascript' }));
            this.precache_worker = new Worker(mission);
            this.precache_worker.onmessage = e => { 
                this.precache_worker.time1 = e.data.t; 
                console.log(`Precaching time: ${this.precache_worker.time1 -this.precache_worker.time0}ms`);
            };
        }
        // Some debugging info
        delete this.precache_worker.time1;
        this.once('moveend', e => {
            if (this.precache_worker.time1 == undefined) {
                this.precache_worker.postMessage({ abort: true });
                console.log(`🔶 Movement has finished before preloading`);
            } else {
                console.log(`🔚 Movement ends ${(this.precache_worker.time1) ? Date.now() - this.precache_worker.time1 : undefined} ms after precaching`);
            }
        });
        this.precache_worker.time0 = Date.now();
        this.precache_worker.postMessage(o);
    };
    _lib.Map.prototype._precache = precache_run;
}


const precache_function = o => {
    /* 
        TODO: get the final pitch and bearing into the equations
        https://chriswhong.github.io/mapboxgl-view-bounds/#12.7/40.7852/-73.9463/-21.8/33
    */
    // Final scenario bbox
    const finalbbox = bounds(o.center, o.zoom, o.dimensions, o.tilesize);
    // transition bbox
    const transbbox = [
        Math.min(o.startCenter[0], o.center[0]),
        Math.min(o.startCenter[1], o.center[1]),
        Math.max(o.startCenter[0], o.center[0]),
        Math.max(o.startCenter[1], o.center[1]),
    ];
    // all the tiles in a bounding box for a given zoom level
    // including a buffer of 1 tile
    const bboxtiles = (bbox, zoom) => {
        const sw = tilebelt.pointToTile(bbox[0], bbox[1], zoom);
        const ne = tilebelt.pointToTile(bbox[2], bbox[3], zoom);
        const result = [];
        for (let x = sw[0] - 1 ; x < ne[0] + 2; x++) {
            for (let y = ne[1] - 1; y < sw[1] + 2; y++) {
                result.push([x, y, zoom]);
            }
        }
        return result;
    };
    // Build the tiles pyramid for final scenario
    let tz;
    let tiles = [];
    for (let z = o.zoom ; z > o.zmin -1; z--) {
        const tt = bboxtiles(finalbbox, z);
        tiles.push(...tt);
        tz = tt.length;
    }
    // Get the tiles for the transition pan
    tiles.push(...bboxtiles(transbbox, o.zmin));
    // Simple trick to fix eventual miscalculations of zmin fof flyTo
    if(o.type == 'fly'){
        tiles.push(...bboxtiles(transbbox, o.zmin - 1));
        tiles.push(...bboxtiles(transbbox, o.zmin + 1));
    }
    // Remove duplicates
    tiles = [...new Set(tiles)];
    // From tiles [x,y,z] to URLs 
    urls = tiles.map(t => {
        return o.sources.map(s => {
            return s.replace('{x}', t[0])
                    .replace('{y}', t[1])
                    .replace('{z}', t[2]);
        });
    }).flat();
    // Fetch all
    Promise.all(urls.map(u => fetch(u, { signal })))
        .then(d => {
            console.log(`Estimated gain: ${Math.round(900 * tz / 6)}ms`);
            console.log(`Prefetched ${urls.length} tiles at zoom levels [${o.zmin} - ${o.zoom}]`);
            postMessage({t: Date.now(), e: false});
        })
        .catch(e => {
            if (e.name !== 'AbortError') console.log('🔴 Precache error');
        });
};

// To be used with importScripts
globalThis.tilebelt = tilebelt;
globalThis.bounds = bounds;