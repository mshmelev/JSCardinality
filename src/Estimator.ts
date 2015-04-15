module Cardinality
{
	export class Estimator
	{
		// Number of bits for indexing HLL substreams - the number of estimators is 2^bitsPerIndex
		private bitsPerIndex: number;

		// Number of bits to compute the HLL estimate on
		private bitsForHll: number;

		// HLL lookup table size
		private m: number;

		// Fixed bias correction factor
		private alphaM: number;

		// Threshold determining whether to use LinearCounting or HyperLogLog based on an initial estimate
		private subAlgorithmSelectionThreshold: number;

		// Lookup table for the dense representation
		private lookupDense: number[];

		// Lookup dictionary for the sparse representation
		private lookupSparse: Object;

		// Max number of elements to hold in the sparse representation
		private sparseMaxElements: number;

		// Indicates that the sparse representation is currently used
		private isSparse: boolean;

		// Set for direct counting of elements
		private directCount = {};

		// Max number of elements to hold in the direct representation
		private static DirectCounterMaxElements = 100;


		/**
		 * .ctor
		 * @param b  Number of bits determining accuracy and memory consumption, in the range [4, 16] (higher = greater accuracy and memory usage).
			* For large cardinalities, the standard error is 1.04 * 2^(-b/2), and the memory consumption is bounded by 2^b kilobytes.
			* The default value of 14 typically yields 3% error or less across the entire range of cardinalities (usually much less),
			* and uses up to ~16kB of memory.  b=4 yields less than ~100% error and uses less than 1kB. b=16 uses up to ~64kB and usually yields 1% error or less.
			* 
			* Also can be result of toJson() function
		 */
		public constructor (b?: number|any)
		{
			if (b === undefined)
				b = 14;

			if (typeof b === "number")
			{
				this.bitsPerIndex = b;
				this.bitsForHll = 64 - b;
				this.m = Math.pow (2, b);
				this.alphaM = Estimator.getAlphaM (this.m);
				this.subAlgorithmSelectionThreshold = Estimator.getSubAlgorithmSelectionThreshold (b);

				// Init the sparse representation
				this.isSparse = true;
				this.lookupSparse = {};

				// Each element in the sparse representation takes 15 bytes, and there is some constant overhead
				this.sparseMaxElements = Math.max (0, this.m / 15 - 10);
				// If necessary, switch to the dense representation
				if (this.sparseMaxElements <= 0)
					this.switchToDenseRepresentation();
			}
			else
			{
				// init from json
				this.bitsPerIndex = b.v[0];
				this.bitsForHll = b.v[1];
				this.m = b.v[2];
				this.alphaM = b.v[3];
				this.subAlgorithmSelectionThreshold = b.v[4];
				this.lookupDense = b.v[5];
				this.lookupSparse = b.v[6];
				this.sparseMaxElements = b.v[7];
				this.isSparse = b.v[8];
				this.directCount = b.v[9];
			}
		}


		/**
		 * Returns cardinality of the set
		 * @returns {} 
		 */
		public count (): number
		{
			// If only a few elements have been seen, return the exact count
			if (this.directCount != null)
				return Estimator.getLookupCount (this.directCount);

			var zInverse = 0;
			var v = 0;
			var sigma: number;
			if (this.isSparse)
			{
				// calc c and Z's inverse
				var lookupSparseCount = 0;
				for (var kvp in this.lookupSparse)
				{
					sigma = this.lookupSparse[kvp];
					zInverse += Math.pow (2, -sigma);
					++lookupSparseCount;
				}
				v = this.m - lookupSparseCount;
				zInverse += (this.m - lookupSparseCount);
			}
			else
			{
				// calc c and Z's inverse
				for (var i = 0; i < this.m; i++)
				{
					sigma = this.lookupDense[i];
					zInverse += Math.pow (2, -sigma);
					if (sigma === 0)
						v++;
				}
			}

			var e = this.alphaM * this.m * this.m / zInverse;
			if (e <= 5.0 * this.m)
				e = BiasCorrection.correctBias (e, this.bitsPerIndex);

			var h: number;
			if (v > 0)
				h = this.m * Math.log (this.m / v); // LinearCounting estimate
			else
				h = e;

			if (h <= this.subAlgorithmSelectionThreshold)
				return Math.round (h);

			return Math.round (e);
		}


		/**
		 * Merges the given <paramref name="other" /> CardinalityEstimator instance into this one
		 * @param other - another instance of CardinalityEstimator
		 * @returns {} 
		 */
		public merge (other: Estimator): void
		{
			if (other.m !== this.m)
				throw new Error ("Cannot merge CardinalityEstimator instances with different accuracy/map sizes");

			var kvp;
			if (this.isSparse && other.isSparse)
			{
				// merge two sparse instances
				for (kvp in other.lookupSparse)
				{
					var index = kvp;
					var otherRank = other.lookupSparse[kvp];
					var thisRank = 0;
					if (this.lookupSparse[index] !== undefined)
						thisRank = this.lookupSparse[index];
					this.lookupSparse[index] = Math.max (thisRank, otherRank);
				}

				// Switch to dense if necessary
				if (Estimator.getLookupCount (this.lookupSparse) > this.sparseMaxElements)
					this.switchToDenseRepresentation();
			}
			else
			{
				// Make sure this (target) instance is dense, then merge
				this.switchToDenseRepresentation();
				if (other.isSparse)
				{
					for (kvp in other.lookupSparse)
					{
						var ind = Number (kvp);
						var rank = other.lookupSparse[kvp];
						this.lookupDense[ind] = Math.max (this.lookupDense[ind], rank);
					}
				}
				else
				{
					for (var i = 0; i < this.m; i++)
						this.lookupDense[i] = Math.max (this.lookupDense[i], other.lookupDense[i]);
				}
			}

			if (other.directCount != null)
			{
				// Other instance is using direct counter. If this instance is also using direct counter, merge them.
				if (this.directCount != null)
				{
					for (kvp in other.directCount)
						this.directCount[kvp] = true;
				}
			}
			else
			{
				// Other instance is not using direct counter, make sure this instance doesn't either
				this.directCount = null;
			}
		}


		/**
		 * 
		 * @param hashCode - the 64-bit FNV-1a hash
		 * @returns {} 
		 */
		public addHashCode (hashCode: number[]): void
		{
			if (this.directCount != null)
			{
				this.directCount[Estimator.longToString (hashCode)] = true;
				if (Estimator.getLookupCount (this.directCount) > Estimator.DirectCounterMaxElements)
					this.directCount = null;
			}

			var substream = Estimator.longRShift (hashCode, this.bitsForHll)[0] & 0xffff;
			var sigma = Estimator.getSigma (hashCode, this.bitsForHll);
			if (this.isSparse)
			{
				var prevRank = 0;
				if (this.lookupSparse[substream] !== undefined)
					prevRank = this.lookupSparse[substream];
				this.lookupSparse[substream] = Math.max (prevRank, sigma);
				if (Estimator.getLookupCount (this.lookupSparse) > this.sparseMaxElements)
					this.switchToDenseRepresentation();
			}
			else
			{
				this.lookupDense[substream] = Math.max (this.lookupDense[substream], sigma);
			}
		}


		private static getLookupCount (lookupObj: Object): number
		{
			var n = 0;
			for (var k in lookupObj)
				++n;
			return n;
		}


		private static longRShift (n: number[], bits: number): number[]
		{
			var res = [];

			if (bits < 32)
			{
				res[0] = (n[0] >>> bits) | (n[1] << (32 - bits));
				if (res[0] < 0)
					res[0] = (res[0] & 0x7fffffff) + 0x80000000; // convert to positive representation of the same number

				res[1] = n[1] >>> bits;
			}
			else
			{
				res[0] = n[1] >>> (bits - 32);
				res[1] = 0;
			}

			return res;
		}


		private static longToString (n: number[]): string
		{
			var s = Number(n[0]).toString (16);
			while (s.length < 8) // 0xffffffff
				s = "0" + s;
			s = Number(n[1]).toString (16) + s;
			return s;
		}


		/**
		 * Returns the threshold determining whether to use LinearCounting or HyperLogLog for an estimate. Values are from the supplementary material of Huele et al.
		 * @param bits - Number of bits
		 * @returns {} 
		 */
		private static getSubAlgorithmSelectionThreshold (bits: number): number
		{
			switch (bits)
			{
				case 4:
					return 10;
				case 5:
					return 20;
				case 6:
					return 40;
				case 7:
					return 80;
				case 8:
					return 220;
				case 9:
					return 400;
				case 10:
					return 900;
				case 11:
					return 1800;
				case 12:
					return 3100;
				case 13:
					return 6500;
				case 14:
					return 11500;
				case 15:
					return 20000;
				case 16:
					return 50000;
				case 17:
					return 120000;
				case 18:
					return 350000;
			}
			throw new Error ("Unexpected number of bits (should never happen)");
		}


		/**
		 * Gets the appropriate value of alpha_M for the given m parameter />
		 * @param m - size of the lookup table
		 * @returns {alpha_M for bias correction} 
		 */
		private static getAlphaM (m: number): number
		{
			switch (m)
			{
				case 16:
					return 0.673;
				case 32:
					return 0.697;
				case 64:
					return 0.709;
				default:
					return 0.7213 / (1 + 1.079 / m);
			}
		}


		/**
		 * Returns the number of leading zeroes in the bitsToCount highest bits of hash, plus one
		 * @param hash - Hash value to calculate the statistic on
		 * @param bitsToCount - Lowest bit to count from hash parameter
		 * @returns {The number of leading zeroes in the binary representation of hash parameter, plus one} 
		 */
		public static getSigma (hash: number[], bitsToCount: number): number
		{
			var sigma = 1;
			for (var i = bitsToCount - 1; i >= 0; --i)
			{
				if ((Estimator.longRShift (hash, i)[0] & 1) === 0)
					sigma++;
				else
					break;
			}
			return sigma;
		}


		/**
		 * Converts this estimator from the sparse to the dense representation
		 * @returns {} 
		 */
		private switchToDenseRepresentation (): void
		{
			if (!this.isSparse)
				return;

			this.lookupDense = new Array (this.m);
			for (var i = 0; i < this.lookupDense.length; ++i)
				this.lookupDense[i] = 0;

			for (var kvp in this.lookupSparse)
			{
				var index = Number (kvp);
				this.lookupDense[index] = this.lookupSparse[kvp];
			}
			this.lookupSparse = null;
			this.isSparse = false;
		}


		public toJson(): Object
		{
			// compact form
			return {
				v: [this.bitsPerIndex, this.bitsForHll, this.m, this.alphaM, this.subAlgorithmSelectionThreshold, this.lookupDense,
					this.lookupSparse, this.sparseMaxElements, this.isSparse, this.directCount]
			};
		}
	}
}