"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollClusterAnalysisJsonSchema = exports.MessageGroup = exports.PollExpansionEventSchema = exports.PollCreationEventSchema = exports.PollAnalysisCompleteEventSchema = exports.QueueType = void 0;
var zod_1 = require("zod");
var QueueType;
(function (QueueType) {
    QueueType["GENERATE_AI_CONTENT"] = "generateAiContent";
    QueueType["PATH_TO_VICTORY"] = "pathToVictory";
    QueueType["TCR_COMPLIANCE_STATUS_CHECK"] = "tcrComplianceStatusCheck";
    QueueType["DOMAIN_EMAIL_FORWARDING"] = "domainEmailForwarding";
    QueueType["POLL_ANALYSIS_COMPLETE"] = "pollAnalysisComplete";
    QueueType["POLL_CREATION"] = "pollCreation";
    QueueType["POLL_EXPANSION"] = "pollExpansion";
})(QueueType || (exports.QueueType = QueueType = {}));
exports.PollAnalysisCompleteEventSchema = zod_1.default.object({
    type: zod_1.default.literal(QueueType.POLL_ANALYSIS_COMPLETE),
    data: zod_1.default.object({
        pollId: zod_1.default.string(),
        totalResponses: zod_1.default.number(),
        responsesLocation: zod_1.default.string(),
        issues: zod_1.default.array(zod_1.default.object({
            pollId: zod_1.default.string(),
            rank: zod_1.default.number().min(1).max(3),
            theme: zod_1.default.string(),
            summary: zod_1.default.string(),
            analysis: zod_1.default.string(),
            responseCount: zod_1.default.number(),
            quotes: zod_1.default.array(zod_1.default.object({ quote: zod_1.default.string(), phone_number: zod_1.default.string() })),
        })),
    }),
});
exports.PollCreationEventSchema = zod_1.default.object({
    type: zod_1.default.literal(QueueType.POLL_CREATION),
    data: zod_1.default.object({ pollId: zod_1.default.string() }),
});
exports.PollExpansionEventSchema = zod_1.default.object({
    type: zod_1.default.literal(QueueType.POLL_EXPANSION),
    data: zod_1.default.object({ pollId: zod_1.default.string() }),
});
var MessageGroup;
(function (MessageGroup) {
    MessageGroup["p2v"] = "p2v";
    MessageGroup["content"] = "content";
    MessageGroup["tcrCompliance"] = "tcrCompliance";
    MessageGroup["default"] = "default";
    MessageGroup["domainEmailRedirect"] = "domainEmailRedirect";
    MessageGroup["polls"] = "polls";
})(MessageGroup || (exports.MessageGroup = MessageGroup = {}));
var PollResponseJsonRowSchema = zod_1.default.object({
    atomicId: zod_1.default.string(),
    phoneNumber: zod_1.default.string(),
    receivedAt: zod_1.default.string(),
    originalMessage: zod_1.default.string(),
    atomicMessage: zod_1.default.string(),
    pollId: zod_1.default.string(),
    clusterId: zod_1.default.union([zod_1.default.number(), zod_1.default.string()]), // Empty string for opt-out rows
    theme: zod_1.default.string(),
    category: zod_1.default.string(),
    summary: zod_1.default.string(),
    sentiment: zod_1.default.string(),
    isOptOut: zod_1.default.boolean(),
});
exports.PollClusterAnalysisJsonSchema = zod_1.default.array(PollResponseJsonRowSchema);
