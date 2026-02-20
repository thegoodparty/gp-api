"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.urlIncludesPath = exports.ensureUrlHasProtocol = exports.getUrlProtocol = exports.generateRandomString = exports.toLowerAndTrim = exports.trimMany = void 0;
exports.camelToSentence = camelToSentence;
exports.capitalizeFirstLetter = capitalizeFirstLetter;
exports.normalizePhoneNumber = normalizePhoneNumber;
var crypto_1 = require("crypto");
var numbers_util_1 = require("./numbers.util");
var trimMany = function (strings) {
    return Object.entries(strings).reduce(function (acc, _a) {
        var _b;
        var key = _a[0], _c = _a[1], value = _c === void 0 ? '' : _c;
        return (__assign(__assign({}, acc), (_b = {}, _b[key] = value.trim(), _b)));
    }, {});
};
exports.trimMany = trimMany;
var toLowerAndTrim = function (str) {
    if (str === void 0) { str = ''; }
    return str.trim().toLowerCase();
};
exports.toLowerAndTrim = toLowerAndTrim;
var MAX_STRING_LENGTH = Number(process.env.MAX_STRING_LENGTH || 2048);
var CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
var generateRandomString = function (minlength, maxLength) {
    if (minlength === void 0) { minlength = 1; }
    if (maxLength === void 0) { maxLength = MAX_STRING_LENGTH; }
    return __spreadArray([], (0, crypto_1.randomBytes)((0, numbers_util_1.getRandomInt)(minlength, maxLength > MAX_STRING_LENGTH ? MAX_STRING_LENGTH : maxLength)), true).map(function (b) { return CHARSET[b % CHARSET.length]; })
        .join('');
};
exports.generateRandomString = generateRandomString;
function camelToSentence(text) {
    var result = text.replace(/([A-Z])/g, ' $1');
    return result.charAt(0).toUpperCase() + result.slice(1);
}
function capitalizeFirstLetter(str) {
    if (!str || str.length < 2)
        return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
var getUrlProtocol = function (url) {
    var _a;
    var result = url.match(/^https?:\/\//i); // Check if URL is already prefixed with http(s), case-insensitive
    return (_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
};
exports.getUrlProtocol = getUrlProtocol;
var ensureUrlHasProtocol = function (url) {
    return (0, exports.getUrlProtocol)(url) ? url : "https://".concat(url);
};
exports.ensureUrlHasProtocol = ensureUrlHasProtocol;
var urlIncludesPath = function (urlStr) {
    // optional protocol, but must have path (e.g. http://example.com/path not just http://example.com)
    return /^(https?:\/\/)?[^\/\s]+\/[^\/\s]+.*$/i.test(urlStr);
};
exports.urlIncludesPath = urlIncludesPath;
function normalizePhoneNumber(phoneNumber) {
    var cleaned = phoneNumber
        .replaceAll('+1', '')
        .replaceAll(' ', '')
        .replaceAll('-', '')
        .replaceAll('(', '')
        .replaceAll(')', '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        cleaned = cleaned.slice(1);
    }
    if (cleaned.length !== 10) {
        throw new Error("Phone number ".concat(phoneNumber, " could not be normalized"));
    }
    return "+1".concat(cleaned);
}
