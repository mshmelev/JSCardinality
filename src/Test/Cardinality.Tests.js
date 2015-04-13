module("Estimator", {
	setup: function ()
	{
	},
	teardown: function ()
	{
	}
});


test ("Test getSigma", function ()
{
	expect (5);

	// simulate a 64 bit hash and 14 bits for indexing
	var bitsToCount = 64 - 14;
	equal (51, Cardinality.Estimator.getSigma ([0, 0], bitsToCount));
	equal (50, Cardinality.Estimator.getSigma ([1, 0], bitsToCount));
	equal (47, Cardinality.Estimator.getSigma ([8, 0], bitsToCount));
	equal (1, Cardinality.Estimator.getSigma ([0xffffffff, 0x3ffff], bitsToCount));
	equal (51, Cardinality.Estimator.getSigma ([0x0, 0x80000], bitsToCount));
});


test ("Test Different Accuracies", function ()
{
	expect (4);
	runEstTest (0.26, 1000000); // 4 bits
	runEstTest (0.01625, 1000000); // 12 bits
	runEstTest (0.008125, 1000000); // 14 bits
	runEstTest (0.0040625, 1000000); // 16 bits
});


test("Accuracy Is Perfect Under 100 Members", function ()
{
	expect(99);

	for (var i = 1; i < 100; ++i)
		runEstTest (0.1, i, 0);
});


test ("Test Accuracy Small Cardinality", function ()
{
	expect(21);

	for (var i = 1; i < 10000; i *= 4)
	{
		runEstTest (0.26, i, 1.5);
		runEstTest (0.008125, i, 0.05);
		runEstTest (0.0040625, i, 0.05);
	}
});


test("Test merge Cardinality Under 100", function ()
{
	expect(1);

	runEstTest(0.008125, 99, 0, 60);
});


test("Test merge Large Cardinality", function ()
{
	expect(1);

	runEstTest(0.008125, 1000000, undefined, 60);
});


test ("Test serialization to json uner 100", function ()
{
	expect (1);

	var hll = new Cardinality.Estimator();
	for (var i = 0; i < 99; ++i)
		hll.addHashCode ([Math.floor (Math.random() * 0x100000000), Math.floor (Math.random() * 0x100000000)]);

	var hll2 = new Cardinality.Estimator(hll.toJson());
	equal (hll.count(), hll2.count());
});


test ("Test serialization to json of large cardinality", function ()
{
	expect (1);

	var hll = new Cardinality.Estimator();
	for (var i = 0; i < 10000; ++i)
		hll.addHashCode ([Math.floor (Math.random() * 0x100000000), Math.floor (Math.random() * 0x100000000)]);

	var hll2 = new Cardinality.Estimator(hll.toJson());
	equal (hll.count(), hll2.count());
});


function runEstTest (stdError, expectedCount, maxAcceptedError, numHllInstances)
{
	if (numHllInstances === void 0)
		numHllInstances = 1;
	maxAcceptedError = maxAcceptedError === undefined ? 5 * stdError : maxAcceptedError; // should fail appx once in 1.7 million runs

	var b = getAccuracyInBits (stdError);

	// init HLLs
	var hlls = [], i;
	for (i = 0; i < numHllInstances; ++i)
		hlls[i] = new Cardinality.Estimator (b);

	for (i = 0; i < expectedCount; ++i)
	{
		// pick random hll, add member
		var chosenHll = Math.floor (Math.random() * numHllInstances);
		hlls[chosenHll].addHashCode ([Math.floor (Math.random() * 0x100000000), Math.floor (Math.random() * 0x100000000)]);
	}

	// merge
	var mergedHll = new Cardinality.Estimator(b);
	for (i = 0; i < numHllInstances; ++i)
		mergedHll.merge (hlls[i]);

	var obsError = Math.abs (mergedHll.count() / expectedCount - 1.0);
	ok (obsError <= maxAcceptedError, "Observed error was over " + maxAcceptedError);
}

/**
 * Gets the number of indexing bits required to produce a given standard error
 * @param {} stdError - Standard error, which determines accuracy and memory consumption. For large cardinalities, the observed error is usually less than 3*stdError
 * @returns {} 
 */
function getAccuracyInBits(stdError)
{
	var sqrtm = 1.04 / stdError;
	var b = Math.ceil(Math.log(sqrtm * sqrtm) / Math.LN2);
	return b;
}