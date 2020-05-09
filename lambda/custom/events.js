'use strict';

const AWS = require('aws-sdk');
const config = require('./config.js');
// Set region to lambda function one (default: us-east-1)
AWS.config.update({region: process.env.AWS_REGION || 'us-east-1'});
// Create CloudWatchEvents service object
const cwevents = new AWS.CloudWatchEvents();
// Create Lambda service object
const lambda = new AWS.Lambda();
// Define event rule schedule name
const ruleName = 'AlexaAfterShipNotificationSchedule';
// Define event rule target id
const targetId = 'AlexaAfterShipNotificationTarget';

/**
 * Create event rule schedule
 * @return {Promise}
 */
function createRule() {
  const params = {
    Name: ruleName,
    ScheduleExpression: `rate(${config.SCHEDULE_RATE} minutes)`,
    State: 'ENABLED'
  };
  return cwevents.putRule(params).promise();
}

/**
 * Create event rule target
 * @param  {String} functionArn
 * @param  {String} userId
 * @return {Promise}
 */
function createTarget(functionArn, userId) {
  const params = {
    Rule: ruleName,
    Targets: [{
      Id: targetId,
      Arn: functionArn,
      Input: JSON.stringify({
        'source': 'aws.events',
        'type': 'skillMessaging',
        'message': {
          'event': 'getProactiveEvents'
        },
        'userId': userId
      })
    }]
  };
  return cwevents.putTargets(params).promise();
}

/**
 * Delete event rule schedule
 * @return {Promise}
 */
function deleteRule() {
  const params = {
    Name: ruleName
  };
  return cwevents.deleteRule(params).promise();
}

/**
 * Delete event rule target
 * @return {Promise}
 */
function deleteTarget() {
  const params = {
    Rule: ruleName,
    Ids: [targetId]
  };
  return cwevents.removeTargets(params).promise();
}

/**
 * Add event rule lambda permission
 * @param  {String} ruleArn
 * @return {Promise}
 */
function addPermission(ruleArn) {
  const params = {
    Action: 'lambda:InvokeFunction',
    FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    Principal: 'events.amazonaws.com',
    StatementId: ruleName,
    SourceArn: ruleArn
  };
  return lambda.addPermission(params).promise();
}

/**
 * Remote event rule lambda permission
 * @return {Promise}
 */
function removePermission() {
  const params = {
    FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
    StatementId: ruleName
  };
  return lambda.removePermission(params).promise();
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
