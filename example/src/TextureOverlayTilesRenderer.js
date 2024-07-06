import { TextureLoader, ImageBitmapLoader } from 'three';
import { PriorityQueue } from '../..';

// TODO: Enable TilesRenderer to delay load model events until all textures have loaded
// TODO: Load textures while the tile geometry is loading - can we start this sooner than parse tile?
// TODO: What happens if a tile starts loading and then a layer is added, meaning it's not in the "loaded tiles" callback
// or active function and we haven't caught it in the parseTile function. Additional callback? Store the loading models?

function canUseImageBitmap() {

	let isSafari = false;
	let isFirefox = false;
	let firefoxVersion = - 1;

	if ( typeof navigator !== 'undefined' ) {

		isSafari = /^((?!chrome|android).)*safari/i.test( navigator.userAgent ) === true;
		isFirefox = navigator.userAgent.indexOf( 'Firefox' ) > - 1;
		firefoxVersion = isFirefox ? navigator.userAgent.match( /Firefox\/([0-9]+)\./ )[ 1 ] : - 1;

	}


	return ! ( typeof createImageBitmap === 'undefined' || isSafari || ( isFirefox && firefoxVersion < 98 ) );

}

class TextureCache {

	constructor( loadTextureCallback, queue ) {

		this.cache = {};
		this.fetchOptions = {};
		this.loadTextureCallback = loadTextureCallback;
		this.queue = queue;

	}

	getTextureLoader() {

		const fetchOptions = this.fetchOptions;

		let loader;
		if ( canUseImageBitmap() ) {

			loader = new ImageBitmapLoader();

		} else {

			loader = new TextureLoader();

		}

		if ( fetchOptions.credentials === 'include' && fetchOptions.mode === 'cors' ) {

			loader.setCrossOrigin( 'use-credentials' );

		}

		if ( 'credentials' in fetchOptions ) {

			loader.setWithCredentials( fetchOptions.credentials === 'include' );

		}

		if ( fetchOptions.headers ) {

			loader.setRequestHeader( fetchOptions.headers );

		}

		return loader;

	}

	loadTexture( key ) {

		const cache = this.cache;
		if ( key in cache ) {

			return cache[ key ].promise;

		}

		const abortController = new AbortController();
		const promise = this.queue
			.add( key, () => {

				return this.loadTextureCallback( key );

			} )
			.then( tex => {

				if ( ! abortController.signal.aborted ) {

					cache[ key ].texture = tex;
					return tex;

				} else {

					throw new Error( 'TextureCache: Texture load aborted.' );

				}

			} );

		this.cache[ key ] = {
			texture: null,
			abortController,
			promise,
		};

		return promise;

	}

	getTexture( key ) {

		const cache = this.cache;
		if ( key in cache ) {

			return cache[ key ].texture;

		} else {

			return null;

		}

	}

	deleteTexture( key ) {

		const cache = this.cache;
		if ( key in cache ) {

			const info = cache[ key ];
			info.refs --;

			if ( info.refs === 0 ) {

				if ( info.texture ) {

					info.texture.dispose();

				} else if ( info.abortController ) {

					info.abortController.abort();
					this.queue.remove( key );

				}

				delete this.cache[ key ];

			}

		}

	}

	dispose() {

		const cache = this.cache;
		for ( const key in cache ) {

			const info = cache[ key ];
			if ( info.texture ) {

				info.texture.dispose();
				if ( info.texture.image instanceof ImageBitmap ) {

					info.texture.image.close();

				}

			} else if ( info.abortController ) {

				info.abortController.abort();

			}

		}

	}

}

export const TextureOverlayTilesRendererMixin = base => class extends base {

	constructor( ...args ) {

		super( ...args );
		this.caches = {};
		this.queue = new PriorityQueue();
		this.queue.priorityCallback = ( a, b ) => {

			return this.downloadQueue.priorityCallback( a, b );

		};

		this.addEventListener( 'delete-layer-texture', ( { scene, tile } ) => {

			const textures = Object.values( this.getTexturesForTile( tile ) );
			scene.traverse( c => {

				if ( c.material ) {

					c.material.textures = textures;
					c.material.needsUpdate = true;

				}

			} );

		} );

		this.addEventListener( 'load-layer-texture', ( { scene, tile } ) => {

			const textures = Object.values( this.getTexturesForTile( tile ) );
			scene.traverse( c => {

				if ( c.material ) {

					c.material.textures = textures;
					c.material.needsUpdate = true;

				}

			} );

		} );

		this.addEventListener( 'load-model', ( { scene, tile } ) => {

			const caches = this.caches;
			for ( const key in caches ) {

				const cache = caches[ key ];
				cache
					.loadTexture( this.getTileKey( tile ) )
					.then( texture => {

						this.dispatchEvent( {
							type: 'load-layer-texture',
							layer: key,
							tile,
							scene,
							texture,
						} );

					} )
					.catch( () => {} );


			}

		} );

		this.addEventListener( 'dispose-model', ( { tile } ) => {

			const caches = this.caches;
			for ( const key in caches ) {

				const cache = caches[ key ];
				cache.deleteTexture( this.getTileKey( tile ) );

			}

		} );

	}

	getTileKey( tile ) {

		// TODO
		return tile.content.uri;

	}

	getTexturesForTile( tile, target = {} ) {

		const tileKey = this.getTileKey( tile );
		const caches = this.caches;
		for ( const key in target ) {

			if ( ! ( key in caches ) ) delete target[ key ];

		}

		for ( const key in caches ) {

			target[ key ] = caches[ key ].getTexture( tileKey );

		}

		return target;

	}

	registerLayer( name, customTextureCallback ) {

		if ( name in this.caches ) {

			throw new Error();

		}

		const cache = new TextureCache( customTextureCallback, this.queue );
		cache.fetchOptions = this.fetchOptions;
		this.caches[ name ] = cache;

		this.forEachLoadedModel( ( scene, tile ) => {

			cache
				.loadTexture( this.getTileKey( tile ) )
				.then( texture => {

					this.dispatchEvent( {
						type: 'load-layer-texture',
						layer: name,
						tile,
						scene,
						texture,
					} );

				} )
				.catch( () => {} );

		} );

	}

	unregisterLayer( name ) {

		const caches = this.caches;
		if ( name in caches ) {

			const cache = caches[ name ];
			delete caches[ name ];

			this.forEachLoadedModel( ( scene, tile ) => {

				const texture = cache.getTexture( this.getTileKey( tile ) );
				if ( texture ) {

					this.dispatchEvent( {
						type: 'delete-layer-texture',
						layer: name,
						tile,
						scene,
						texture,
					} );

				}

			} );

			cache.dispose();

		}

	}

};

