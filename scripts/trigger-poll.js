"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Temporary script to simulate triggerPollExecution for local testing.
 *
 * Creates ELECTED_OFFICIAL outbound messages for a poll, using phone numbers
 * extracted from a cluster analysis JSON. This is the prerequisite step before
 * running complete-poll.ts.
 *
 * Usage:
 *   npx tsx scripts/trigger-poll.ts <pollId> <path-to-cluster-analysis.json>
 *
 * What it does:
 *   1. Validates the poll exists
 *   2. Reads the cluster analysis JSON to extract unique phone numbers
 *   3. Creates ELECTED_OFFICIAL PollIndividualMessage records for each phone
 *      (with deterministic IDs, so re-running is safe)
 *
 * Skipped (not needed for local testing):
 *   - Contact sampling via People API
 *   - S3 CSV upload
 *   - Slack message to Tevyn
 */
var fs_1 = require("fs");
var client_1 = require("@prisma/client");
var uuid_1 = require("uuid");
var queue_types_1 = require("../src/queue/queue.types");
var strings_util_1 = require("../src/shared/util/strings.util");
var POLL_INDIVIDUAL_MESSAGE_NAMESPACE = 'a0e5f0a1-2b3c-4d5e-8f70-8192a3b4c5d6';
var PERSON_ID_NAMESPACE = 'b1f6e1b2-3c4d-5e6f-9081-9203b4c5d6e7';
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, pollId, jsonPath, poll, raw, rows, uniquePhones, existing, now, created, skipped;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _a = process.argv.slice(2), pollId = _a[0], jsonPath = _a[1];
                    if (!pollId || !jsonPath) {
                        console.error('Usage: npx tsx scripts/trigger-poll.ts <pollId> <path-to-cluster-analysis.json>');
                        process.exit(1);
                    }
                    return [4 /*yield*/, prisma.poll.findUnique({ where: { id: pollId } })];
                case 1:
                    poll = _b.sent();
                    if (!poll) {
                        console.error("Poll ".concat(pollId, " not found"));
                        process.exit(1);
                    }
                    if (!poll.electedOfficeId) {
                        console.error('Poll has no elected office');
                        process.exit(1);
                    }
                    console.log("Poll \"".concat(poll.name, "\" (").concat(pollId, ")"));
                    raw = (0, fs_1.readFileSync)(jsonPath, 'utf-8');
                    rows = queue_types_1.PollClusterAnalysisJsonSchema.parse(JSON.parse(raw));
                    uniquePhones = Array.from(new Set(rows.map(function (r) { return (0, strings_util_1.normalizePhoneNumber)(r.phoneNumber); })));
                    console.log("Found ".concat(uniquePhones.length, " unique phone numbers in ").concat(rows.length, " rows"));
                    return [4 /*yield*/, prisma.pollIndividualMessage.count({
                            where: { pollId: pollId, sender: 'ELECTED_OFFICIAL' },
                        })];
                case 2:
                    existing = _b.sent();
                    if (existing > 0) {
                        console.log("Poll already has ".concat(existing, " outbound messages \u2014 upserting to fill gaps"));
                    }
                    now = new Date();
                    created = 0;
                    skipped = 0;
                    return [4 /*yield*/, prisma.$transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            var _i, uniquePhones_1, phone, personId, messageId, data;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        _i = 0, uniquePhones_1 = uniquePhones;
                                        _a.label = 1;
                                    case 1:
                                        if (!(_i < uniquePhones_1.length)) return [3 /*break*/, 4];
                                        phone = uniquePhones_1[_i];
                                        personId = (0, uuid_1.v5)("".concat(pollId, "-person-").concat(phone), PERSON_ID_NAMESPACE);
                                        messageId = (0, uuid_1.v5)("".concat(pollId, "-").concat(personId), POLL_INDIVIDUAL_MESSAGE_NAMESPACE);
                                        data = {
                                            id: messageId,
                                            pollId: poll.id,
                                            personId: personId,
                                            sentAt: now,
                                            personCellPhone: phone,
                                            electedOfficeId: poll.electedOfficeId,
                                            sender: 'ELECTED_OFFICIAL',
                                        };
                                        return [4 /*yield*/, tx.pollIndividualMessage.upsert({
                                                where: { id: messageId },
                                                create: data,
                                                update: { sentAt: now },
                                            })];
                                    case 2:
                                        _a.sent();
                                        created++;
                                        _a.label = 3;
                                    case 3:
                                        _i++;
                                        return [3 /*break*/, 1];
                                    case 4: return [2 /*return*/];
                                }
                            });
                        }); }, { timeout: 30000 })];
                case 3:
                    _b.sent();
                    console.log("Upserted ".concat(created, " ELECTED_OFFICIAL messages (").concat(skipped, " unchanged)"));
                    console.log("\nDone. Now run:\n  npx tsx scripts/complete-poll.ts ".concat(pollId, " ").concat(jsonPath));
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .then(function () { return prisma.$disconnect(); })
    .catch(function (e) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.error(e);
                return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                process.exit(1);
                return [2 /*return*/];
        }
    });
}); });
