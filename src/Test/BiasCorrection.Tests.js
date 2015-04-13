module("BiasCorrection", {
	setup: function ()
	{
	},
	teardown: function ()
	{
	}
});


test("When Raw Estimate Is In Array Correct Bias Is Used", function()
{
	expect(1);
	var corrected = Cardinality.BiasCorrection.correctBias(12.207, 4);
	equal (12.207 - 9.207, corrected);
});

test("When Raw Estimate Is Between Array Values Correct Bias Is Used", function()
{
	expect(1);
	var corrected = Cardinality.BiasCorrection.correctBias(11.1, 4);
	// The bias should be between 10 and 9.717, but much closer to 10
	equal (1.1394700139470011, corrected);
});


test("When Raw Estimate Is Larger Than All Array Values Correct Bias Is Used", function()
{
	expect(1);
	// The bias of the last array element should be used
	var corrected = Cardinality.BiasCorrection.correctBias(78.0, 4);
	equal (78.0 - -1.7606, corrected);
});


test("When Raw Estimate Is Smaller Than All Array Values Correct Bias Is Used", function()
{
	expect(1);
	// The bias of the first array element should be used
	var corrected = Cardinality.BiasCorrection.correctBias(10.5, 4);
	equal (10.5 - 10, corrected);
});


test("When Corrected Estimate Is Below Zero Zero Is Returned", function()
{
	expect(1);
	var corrected = Cardinality.BiasCorrection.correctBias(5, 4);
	equal (0, corrected);
});

