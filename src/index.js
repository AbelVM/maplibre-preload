/*jshint esversion:11 */
import * as tilebelt from '@mapbox/tilebelt';
import { bounds } from '@mapbox/geo-viewport';
import ErrorStackParser from 'error-stack-parser';
import Point from '@mapbox/point-geometry';
const _lib = globalThis.maplibregl;

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
        let zmin = Math.min(this.getZoom(), options.zoom);
        if (options.type == 'fly') {
            // Extracted from https://www.win.tue.nl/~vanwijk/zoompan.pdf
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
            const zd = Math.floor(this.getZoom() + this.transform.scaleZoom(1 / wmax));
            zmin = Math.max(Math.min(zmin + zd, options.minZoom || zmin + zd), 0);
        }
        return {
            sources: _sources,
            dimensions: _dimensions,
            tilesize: _tilesize,
            startCenter: this.getCenter(),
            startZoom: this.getZoom(),
            zmin: zmin
        };
    };
    _lib.Map.prototype._context = _context;

    const precache_run = function (o) {
        if (window === self && this.precache_worker == undefined) {
            // the actual absolute path of the running script
            // as the module-typed workers are only supported by Chrome
            const _imported = ErrorStackParser.parse(new Error('BOOM'))[0].fileName;
            // build inline worker
            const target = `
            importScripts('${_imported}');
            onmessage = function (o){
                let _func = ${precache_function.toString()};
                _func.apply(null, [o.data]);
            }`;
            const mission = URL.createObjectURL(new Blob([target], { 'type': 'text/javascript' }));
            this.precache_worker = new Worker(mission);
            this.precache_worker.onmessage = e => { this.precache_worker.time = e.data; };
        }
        // Some debugging info
        delete this.precache_worker.time;
        this.once('moveend', e => {
            if (this.precache_worker.time == undefined) {
                console.log(`🔴 Movement has finished before preloading`);
            } else {
                console.log(`Movement ends ${(this.precache_worker.time) ? Date.now() - this.precache_worker.time : undefined} ms after precaching`);
            }
        });
        this.precache_worker.postMessage(o);
    };
    _lib.Map.prototype._precache = precache_run;
}


const precache_function = o => {
    /* 
        TODO: get the final pitch and bearing into the equations
        https://chriswhong.github.io/mapboxgl-view-bounds/#12.7/40.7852/-73.9463/-21.8/33
    */

    // Final scenario
    const finalbbox = bounds(o.center, o.zoom, o.dimensions, o.tilesize);
    const finaltile = tilebelt.bboxToTile(finalbbox);

    //transition
    const transbbox = [
        Math.min(o.startCenter[0], o.center[0]),
        Math.min(o.startCenter[1], o.center[1]),
        Math.max(o.startCenter[0], o.center[0]),
        Math.max(o.startCenter[1], o.center[1]),
    ];
    const transtile = tilebelt.bboxToTile(transbbox);

    // Check whether a tile intersects a boundingbox
    const isVisible = (t, b) => {
        const
            tbb = tilebelt.tileToBBOX(t),
            tf = [
                { x: tbb[0], y: tbb[1] },
                { x: tbb[0], y: tbb[3] },
                { x: tbb[2], y: tbb[1] },
                { x: tbb[2], y: tbb[3] }
            ],
            bf = [
                { x: b[0], y: b[1] },
                { x: b[0], y: b[3] },
                { x: b[2], y: b[1] },
                { x: b[2], y: b[3] }
            ],
            contains = (box, p) => {
                if (p.x < box[0] || p.x > box[2] || p.y < box[1] || p.y > box[3]) {
                    return false;
                } else {
                    return true;
                }
            };
        for (let i = 0; i < 4; i++) {
            if (contains(b, tf[i])) return true;
        }
        for (let i = 0; i < 4; i++) {
            if (contains(tbb, bf[i])) return true;
        }
        return false;
    };

    // Get all the visible children tiles of a tile at a given zoom level
    const getChildrenZ = (t, z, b) => {
        if (Math.floor(z) <= t[2]) return [t];
        let
            tt = tilebelt.getChildren(t).filter(a => isVisible(a, b));
        for (let i = t[2] + 1; i < Math.floor(z + 1); i++) {
            let tt2 = [];
            tt.forEach(b => tt2.push(...tilebelt.getChildren(b)));
            tt = [...tt2.filter(a => isVisible(a, b))];
        }
        return tt;
    };

    // Build the tiles pyramid
    let tiles = [];
    for (let z = o.zmin; z < o.zoom + 1; z++) {
        tiles.push(...getChildrenZ(transtile, z, transbbox));
        tiles.push(...getChildrenZ(finaltile, z, finalbbox));
    }
    tiles = [...new Set(tiles)];
    // From tiles [x,y,z] to URLs 
    urls = tiles.map(t => {
        return o.sources.map(s => {
            return s.replace('{x}', t[0])
                .replace('{y}', t[1])
                .replace('{z}', t[2]);
        }).flat();
    });

    // Fetch all
    Promise.all(urls.map(u => fetch(u))).then(d => {
        postMessage(Date.now());
        console.log(`Prefetched ${urls.length} tiles at zoom levels [${o.zmin} - ${o.zoom}]`);
    });
};

// To be used with importScripts
globalThis.tilebelt = tilebelt;
globalThis.bounds = bounds;