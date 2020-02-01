'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require("path");

/**
 * AWS resources path
 * @type {String}
 */
const AWS_RESOURCES_PATH = '../resources/aws';

/**
 * Lambda code path
 * @type {String}
 */
const LAMBDA_CODE_PATH = '../lambda/custom';

/**
 * Skill schema path
 * @type {String}
 */
const SKILL_SCHEMA_PATH = '../skill.json';

/**
 * Lambda function name
 * @type {String}
 */
const FUNCTION_NAME = 'alexa-aftership';

/**
 * IAM policy name
 * @type {String}
 */
const POLICY_NAME = 'AlexaAfterShipPolicy';

/**
 * IAM role name
 * @type {String}
 */
const ROLE_NAME = `ask-lambda-AfterShip`;


/**
 * Execute command
 * @param  {String}  command
 * @param  {Boolean} json
 * @return {Promise}
 */
function executeCommand(command, json=false) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(stderr.trim());
      } else if (json) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve({});
        }
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Execute AWS CLI command
 * @param  {String} args
 * @return {Promise}
 */
function executeAWSCommand(args) {
  return executeCommand(`aws ${args} --output json`, true);
}

/**
 * Load schema from json-formatted file
 * @return {Object}
 */
function loadSchema(file) {
  try {
    const schema = fs.readFileSync(resolvePath(file));
    return JSON.parse(schema);
  } catch (e) {
    console.log(`Failed to load json schema from file: ${file}`);
    process.exit(1);
  }
}

/**
 * Update schema into json-formatted file
 * @param  {String} file
 * @param  {Object} schema
 */
function updateSchema(file, schema) {
  try {
    fs.writeFileSync(resolvePath(file), JSON.stringify(schema, null, 2));
  } catch (e) {
    console.log(`Failed to update json schema into file: ${file}`);
    process.exit(1);
  }
}

/**
 * Resolve full path
 * @param  {String} relpath
 * @return {String}
 */
function resolvePath(relpath) {
  return path.resolve(__dirname, relpath);
}

/**
 * Check required apps installed
 */
function checkRequiredApps() {
  executeCommand('which aws zip')
    .catch(() => {
      console.log(`AWS CLI or ZIP is not installed.`);
      process.exit(1);
    });
}

/**
 * Deploy iam role
 * @return {String}
 */
async function deployIAMRole() {
  const policyFile = resolvePath(`${AWS_RESOURCES_PATH}/iam_role_policy.json`);
  const trustFile = resolvePath(`${AWS_RESOURCES_PATH}/iam_role_trust.json`);
  const policyDocument = loadSchema(policyFile);
  const lambdaPermResource = `arn:aws:lambda:*:*:function:${FUNCTION_NAME}`;

  // Update default policy document if necessary
  policyDocument.Statement.forEach((permission) => {
    if (permission.Resource.startsWith('arn:aws:lambda') && permission.Resource !== lambdaPermResource) {
      permission.Resource = lambdaPermResource;
      updateSchema(policyFile, policyDocument);
    }
  });

  // Create role if not defined
  const result = await executeAWSCommand(
    `iam get-role --role-name ${ROLE_NAME}`
  ).catch(() => executeAWSCommand(
    `iam create-role --role-name ${ROLE_NAME} --assume-role-policy-document file://${trustFile}`
  ));
  // Wait for role to exists
  await executeAWSCommand(
    `iam wait role-exists --role-name ${ROLE_NAME}`
  );
  // Add/update role policy
  await executeAWSCommand(
    `iam put-role-policy --role-name ${ROLE_NAME} --policy-name ${POLICY_NAME} --policy-document file://${policyFile}`
  );
  // Return role arn
  return result.Role.Arn;
}

/**
 * Deploy lambda function
 * @param  {String} roleArn
 * @return {String}
 */
async function deployLambdaFunction(roleArn) {
  const lambdaConfigFile = resolvePath(`${AWS_RESOURCES_PATH}/lambda_function_config.json`);
  const lambdaCodePath = resolvePath(`${LAMBDA_CODE_PATH}`);
  const zipFile = `${lambdaCodePath}/lambda-code.zip`;

  // Create lambda function if not defined
  const result = await executeAWSCommand(
    `lambda get-function --function-name ${FUNCTION_NAME}`
  ).catch(() => executeCommand(
    `cd ${lambdaCodePath} && zip -qr ${zipFile} .`
  ).then(() => executeAWSCommand(
    `lambda create-function --function-name ${FUNCTION_NAME} --cli-input-json file://${lambdaConfigFile} --role ${roleArn} --zip-file fileb://${zipFile}`
  )));
  // Wait for function to exists
  await executeAWSCommand(
    `lambda wait function-exists --function-name ${FUNCTION_NAME}`
  );
  // Delete zip file if exists
  if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
  }
  // Return function arn
  return result.Configuration ? result.Configuration.FunctionArn : result.FunctionArn;
}

/**
 * Update skill schema
 * @param  {String} endpointUri
 */
function updateSkillSchema(endpointUri) {
  const schema = loadSchema(SKILL_SCHEMA_PATH);
  // Update manifest events endpoint uri
  schema.manifest.events.endpoint.uri = endpointUri;
  // Update skill schema
  updateSchema(SKILL_SCHEMA_PATH, schema);
}

/**
 * Main
 */
async function main() {
  try {
    // Check required apps installed
    await checkRequiredApps();
    // Deploy iam role
    const roleArn = await deployIAMRole();
    // Deploy lambda function
    const functionArn = await deployLambdaFunction(roleArn);
    // Update skill schema
    updateSkillSchema(functionArn);
  } catch (error) {
    console.error('Failed to deploy aws resources:', error)
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
