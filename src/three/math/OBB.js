import { Matrix4, Box3, Vector3, Plane, Ray } from 'three';

const _worldMin = new Vector3();
const _worldMax = new Vector3();
const _norm = new Vector3();
const _ray = new Ray();

export class OBB {

	constructor( box = new Box3(), transform = new Matrix4() ) {

		this.box = box.clone();
		this.transform = transform.clone();
		this.inverseTransform = new Matrix4();
		this.points = new Array( 8 ).fill().map( () => new Vector3() );
		this.planes = new Array( 6 ).fill().map( () => new Plane() );

	}

	copy( source ) {

		this.box.copy( source.box );
		this.transform.copy( source.transform );
		this.update();
		return this;

	}

	clone() {

		return new this.constructor().copy( this );

	}

	/**
	 * Clamps the given point within the bounds of this OBB
	 * @param {Vector3} point
	 * @param {Vector3} result
	 * @returns {Vector3}
	 */
	clampPoint( point, result ) {

		return result.copy( point )
			.applyMatrix4( this.inverseTransform )
			.clamp( this.box.min, this.box.max )
			.applyMatrix4( this.transform );

	}

	/**
	 * Returns the distance from any edge of this OBB to the specified point.
	 * If the point lies inside of this box, the distance will be 0.
	 * @param {Vector3} point
	 * @returns {number}
	 */
	distanceToPoint( point ) {

		return this.clampPoint( point, _norm ).distanceTo( point );

	}

	containsPoint( point ) {

		_norm.copy( point ).applyMatrix4( this.inverseTransform );
		return this.box.containsPoint( _norm );

	}

	// returns boolean indicating whether the ray has intersected the obb
	intersectsRay( ray ) {

		_ray.copy( ray ).applyMatrix4( this.inverseTransform );
		return _ray.intersectsBox( this.box );

	}

	// Sets "target" equal to the intersection point.
	// Returns "null" if no intersection found.
	intersectRay( ray, target ) {

		_ray.copy( ray ).applyMatrix4( this.inverseTransform );
		if ( _ray.intersectBox( this.box, target ) ) {

			target.applyMatrix4( this.transform );
			return target;

		} else {

			return null;

		}

	}

	update() {

		const { points, inverseTransform, transform, box } = this;
		inverseTransform.copy( transform ).invert();

		const { min, max } = box;
		let index = 0;
		for ( let x = - 1; x <= 1; x += 2 ) {

			for ( let y = - 1; y <= 1; y += 2 ) {

				for ( let z = - 1; z <= 1; z += 2 ) {

					points[ index ].set(
						x < 0 ? min.x : max.x,
						y < 0 ? min.y : max.y,
						z < 0 ? min.z : max.z,
					).applyMatrix4( transform );
					index ++;

				}

			}

		}

		this.updatePlanes();

	}

	updatePlanes() {

		_worldMin.copy( this.box.min ).applyMatrix4( this.transform );
		_worldMax.copy( this.box.max ).applyMatrix4( this.transform );

		_norm.set( 0, 0, 1 ).transformDirection( this.transform );
		this.planes[ 0 ].setFromNormalAndCoplanarPoint( _norm, _worldMin );
		this.planes[ 1 ].setFromNormalAndCoplanarPoint( _norm, _worldMax ).negate();

		_norm.set( 0, 1, 0 ).transformDirection( this.transform );
		this.planes[ 2 ].setFromNormalAndCoplanarPoint( _norm, _worldMin );
		this.planes[ 3 ].setFromNormalAndCoplanarPoint( _norm, _worldMax ).negate();

		_norm.set( 1, 0, 0 ).transformDirection( this.transform );
		this.planes[ 4 ].setFromNormalAndCoplanarPoint( _norm, _worldMin );
		this.planes[ 5 ].setFromNormalAndCoplanarPoint( _norm, _worldMax ).negate();

	}

	intersectsSphere( sphere ) {

		this.clampPoint( sphere.center, _norm );
		return _norm.distanceToSquared( sphere.center ) <= ( sphere.radius * sphere.radius );

	}

	intersectsFrustum( frustum ) {

		return this._intersectsPlaneShape( frustum.planes, frustum.points );

	}

	intersectsOBB( obb ) {

		return this._intersectsPlaneShape( obb.planes, obb.points );

	}

	// takes a series of 6 planes that define and enclosed shape and the 8 points that lie at the corners
	// of that shape to determine whether the OBB is intersected with.
	_intersectsPlaneShape( otherPlanes, otherPoints ) {

		const thisPoints = this.points;
		const thisPlanes = this.planes;

		// based on three.js' Box3 "intersects frustum" function
		for ( let i = 0; i < 6; i ++ ) {

			const plane = otherPlanes[ i ];
			let maxDistance = - Infinity;
			for ( let j = 0; j < 8; j ++ ) {

				const v = thisPoints[ j ];
				const dist = plane.distanceToPoint( v );
				maxDistance = maxDistance < dist ? dist : maxDistance;

			}

			if ( maxDistance < 0 ) {

				return false;

			}

		}

		// do the opposite check using the obb planes to avoid false positives
		// this check is not performed by three.js' AABB logic but helps prevent a lot incorrect intersection reports
		for ( let i = 0; i < 6; i ++ ) {

			const plane = thisPlanes[ i ];
			let maxDistance = - Infinity;
			for ( let j = 0; j < 8; j ++ ) {

				const v = otherPoints[ j ];
				const dist = plane.distanceToPoint( v );
				maxDistance = maxDistance < dist ? dist : maxDistance;

			}

			if ( maxDistance < 0 ) {

				return false;

			}

		}

		return true;

	}

}
