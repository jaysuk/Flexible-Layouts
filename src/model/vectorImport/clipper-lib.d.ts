// Types for the slice of clipper-lib this app uses.
//
// The package ships no declarations and DefinitelyTyped has none either. Rather
// than take the whole library as `any` — which would let a typo in a fill rule
// through to a wrongly-cut part — this declares exactly the surface offset.ts
// touches, and nothing else. Anything else needed later gets added here first.
//
// Ambient on purpose: FL's typecheck script copies src/ into a separate DWC
// checkout and runs vue-tsc there, resolving node_modules from THAT checkout,
// not this repo's. An ambient `declare module` needs no package on disk at all,
// so it resolves the same way in both places; a real `@types/clipper-lib`
// wouldn't.
//
// Reference: Clipper 6.4.2, Angus Johnson, http://www.angusj.com/delphi/clipper.php
//
// Ported from meeloo/AxisControl (Apache-2.0), src/import/clipper-lib.d.ts.
// Copyright the AxisControl authors; used under the Apache License 2.0.
// Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
// Changes: none.

declare module "clipper-lib" {
	export interface IntPoint {
		X: number;
		Y: number;
	}

	export type Path = IntPoint[];
	export type Paths = Path[];

	export const PolyType: {
		readonly ptSubject: 0;
		readonly ptClip: 1;
	};

	export const ClipType: {
		readonly ctIntersection: 0;
		readonly ctUnion: 1;
		readonly ctDifference: 2;
		readonly ctXor: 3;
	};

	export const PolyFillType: {
		readonly pftEvenOdd: 0;
		readonly pftNonZero: 1;
		readonly pftPositive: 2;
		readonly pftNegative: 3;
	};

	export const JoinType: {
		readonly jtSquare: 0;
		readonly jtRound: 1;
		readonly jtMiter: 2;
	};

	export const EndType: {
		readonly etOpenSquare: 0;
		readonly etOpenRound: 1;
		readonly etOpenButt: 2;
		readonly etClosedLine: 3;
		readonly etClosedPolygon: 4;
	};

	export class Clipper {
		AddPath(path: Path, polyType: number, closed: boolean): boolean;
		AddPaths(paths: Paths, polyType: number, closed: boolean): boolean;
		Execute(
			clipType: number,
			solution: Paths,
			subjFillType?: number,
			clipFillType?: number,
		): boolean;
		Clear(): void;
		/** True when the ring winds anticlockwise in a Y-up coordinate system. */
		static Orientation(path: Path): boolean;
		static Area(path: Path): number;
		static SimplifyPolygons(paths: Paths, fillType?: number): Paths;
		static CleanPolygons(paths: Paths, distance?: number): Paths;
	}

	export class ClipperOffset {
		/**
		 * @param miterLimit how far a miter join may project, in multiples of delta
		 * @param arcTolerance max deviation of a rounded join, in the same integer
		 *   units as the coordinates
		 */
		constructor(miterLimit?: number, arcTolerance?: number);
		AddPath(path: Path, joinType: number, endType: number): void;
		AddPaths(paths: Paths, joinType: number, endType: number): void;
		/** @param delta positive grows the polygon, negative shrinks it. */
		Execute(solution: Paths, delta: number): void;
		Clear(): void;
	}

	const ClipperLib: {
		Clipper: typeof Clipper;
		ClipperOffset: typeof ClipperOffset;
		PolyType: typeof PolyType;
		ClipType: typeof ClipType;
		PolyFillType: typeof PolyFillType;
		JoinType: typeof JoinType;
		EndType: typeof EndType;
	};
	export default ClipperLib;
}
