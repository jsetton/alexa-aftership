'use strict';

const {
  EventBridgeClient,
  PutRuleCommand,
  DeleteRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand
} = require('@aws-sdk/client-eventbridge');
const { LambdaClient, AddPermissionCommand, RemovePermissionCommand } = require("@aws-sdk/client-lambda");
const config = require('./config.js');
// Create Event Bridge client
const eventBridgeClient = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });
// Create Lambda client
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
// Define event rule schedule name
const ruleName = config.AWS_SCHEDULE_NAME;
// Define event rule target id
const targetId = `${ruleName}Target`;

/**
 * Create event rule schedule
 * @return {Promise}
 */
function createRule() {
  const command = new PutRuleCommand({
    Name: ruleName,
    ScheduleExpression: `rate(${config.SCHEDULE_RATE} minutes)`,
    State: 'ENABLED'
  });
  return eventBridgeClient.send(command);
}

/**
 * Create event rule target
 * @param  {String} functionArn
 * @param  {String} userId
 * @return {Promise}
 */
function createTarget(functionArn, userId) {
  const command = new PutTargetsCommand({
    Rule: ruleName,
    Targets: [{
      Id: targetId,
      Arn: functionArn,
      Input: JSON.stringify({
        source: 'aws.events',
        type: 'skillMessaging',
        message: {
          event: 'getProactiveEvents'
        },
        userId: userId
      })
    }]
  });
  return eventBridgeClient.send(command);
}

/**
 * Delete event rule schedule
 * @return {Promise}
 */
function deleteRule() {
  const command = new DeleteRuleCommand({
    Name: ruleName
  });
  return eventBridgeClient.send(command);
}

/**
 * Delete event rule target
 * @return {Promise}
 */
function deleteTarget() {
  const command = new RemoveTargetsCommand({
    Rule: ruleName,
    Ids: [targetId]
  });
  return eventBridgeClient.send(command);
}

/**
 * Add event rule lambda permission
 * @param  {String} ruleArn
 * @return {Promise}
 */
function addPermission(ruleArn) {
  const command = new AddPermissionCommand({
    Action: 'lambda:InvokeFunction',
    FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    Principal: 'events.amazonaws.com',
    StatementId: ruleName,
    SourceArn: ruleArn
  });
  return lambdaClient.send(command);
}

/**
 * Remote event rule lambda permission
 * @return {Promise}
 */
function removePermission() {
  const command = new RemovePermissionCommand({
    FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    StatementId: ruleName
  });
  return lambdaClient.send(command);
}

/**
 * Create event schedule
 * @param  {String} functionArn
 * @param  {String} userId
 * @return {Promise}
 */
async function createSchedule(functionArn, userId) {
  const response = await createRule();
  await Promise.all([
    addPermission(response.RuleArn),
    createTarget(functionArn, userId)
  ]);
}

/**
 * Delete event schedule
 * @return {Promise}
 */
async function deleteSchedule() {
  await Promise.all([
    deleteTarget(),
    removePermission()
  ]);
  await deleteRule();
}

module.exports = {
  createSchedule,
  deleteSchedule
};
