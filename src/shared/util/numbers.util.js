"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomPercentage = exports.getRandomInt = exports.LARGEST_SAFE_INTEGER = void 0;
var faker_1 = require("@faker-js/faker");
exports.LARGEST_SAFE_INTEGER = Math.pow(2, 31) - 1;
var getRandomInt = function (min, max) {
    if (max === void 0) { max = exports.LARGEST_SAFE_INTEGER; }
    return Math.floor(Math.random() * ((max === 0 || max ? max - min : min) + 1)) + min;
};
exports.getRandomInt = getRandomInt;
var getRandomPercentage = function () {
    return faker_1.faker.number.float({ min: 0, max: 100, fractionDigits: 2 });
};
exports.getRandomPercentage = getRandomPercentage;
