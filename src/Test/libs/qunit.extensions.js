// Just swapping 'expected' and 'actual' parameters order, how it should be

var equal = function (expected, actual, message)
{
	QUnit.equal(actual, expected, message);
};


var notEqual = function (expected, actual, message)
{
	QUnit.notEqual (actual, expected, message);
};

var deepEqual = function (expected, actual, message)
{
	QUnit.deepEqual(actual, expected, message);
};

var notDeepEqual = function (expected, actual, message)
{
	QUnit.notDeepEqual(actual, expected, message);
};

var strictEqual = function (expected, actual, message)
{
	QUnit.strictEqual(actual, expected, message);
};

var notStrictEqual = function (expected, actual, message)
{
	QUnit.notStrictEqual(actual, expected, message);
};
