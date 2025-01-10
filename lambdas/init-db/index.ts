import { Client } from 'pg';
import { randomBytes } from 'crypto';
import { SSMClient, PutParameterCommand } from '@aws-sdk/client-ssm';
import { 
  SecretsManagerClient, 
  CreateSecretCommand, 
  GetSecretValueCommand 
} from '@aws-sdk/client-secrets-manager';
import { 
  CloudFormationCustomResourceEvent, 
  CloudFormationCustomResourceResponse, 
  Context 
} from 'aws-lambda';

// Environment variables
const REGION = process.env.REGION;
const SECRET_ARN = process.env.SECRET_ARN;
const UNPRIVILEGED_USER = process.env.UNPRIVILEGED_USER;
const DATABASE = process.env.DATABASE;

// AWS SDK clients
const secretsManager = new SecretsManagerClient({ region: REGION });
const ssmClient = new SSMClient({ region: REGION });

// Lambda function handler
export const handler = async (
  event: CloudFormationCustomResourceEvent, context: Context
): Promise<CloudFormationCustomResourceResponse> => {

  // Response object to be returned to CloudFormation
  let response: any = {
    PhysicalResourceId: context.invokedFunctionArn,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId
  }

  // Generate a random password for the role
  const rolePassword = generateRandomPassword();

  // SQL queries to seed the database
  const queries = [
    `CREATE USER ${UNPRIVILEGED_USER} WITH PASSWORD '${rolePassword}'`,
    `GRANT ALL PRIVILEGES ON DATABASE ${DATABASE} TO ${UNPRIVILEGED_USER}`,
    `GRANT ALL ON SCHEMA public TO ${UNPRIVILEGED_USER}`,
    'CREATE TABLE IF NOT EXISTS sample_table (id INT, name VARCHAR(255))',
    // Add more queries as needed
  ];

  // Retrieve admin database credentials from Secrets Manager

  const { dbname, username, password, host, port } = await getSecretValue(SECRET_ARN!);

  // Connect to the database
  const client = new Client({
    user: username,
    host: host,
    database: DATABASE,
    password: password,
    port: port
  });
  
  await client.connect();

  try {
    switch (event.RequestType) {
      case "Create":
          // Execute each query during resource creation
          for (const query of queries) {
            await executeStatement(client, query);
          }

          // Store the role password in Secrets Manager
          const secretName = `ecs-rds-blueprint-unprivileged-db-user-${generateRandomString(12)}`;
          const secretArn = await createSecret(secretName, JSON.stringify({
            username: UNPRIVILEGED_USER,
            password: rolePassword,
            dbname: DATABASE,
            host:host,
            port:port,
          }));
          
          // Set an SSM parameter with the secret ARN
          await setSSMParameter('/eu/ecs-rds-blueprint/rds/unprivileged-user/secret/arn', secretArn!);

          console.log('Database initialization complete.');
          response.Status = 'SUCCESS'
          response.Reason = 'Database initialization complete.'
        
        break;
      case "Delete":
      case "Update":
        // No action needed for update or delete events
        console.log('Update or Delete event requested. No action.');
        response.Status = 'SUCCESS'
        response.Reason = 'Update or Delete event requested. No action.'
        break;
    }
  } catch (error) {
    // Handle errors and mark the response as failed
    console.error('Database initialization failed:', error);
    response.Status = 'FAILED'
    response.Reason = error
  } finally {
    await client.end();
  }

  return response

};

// Helper function to execute SQL statements
const executeStatement = async (client: Client, query: string): Promise<void> => {
  try {
    await client.query(query);
    console.debug(`Query executed successfully: ${query}`);
  } catch (error) {
    console.error(`Error executing query: ${query}`, error);
    throw error;
  }
};

// Function to generate a random password using crypto.randomBytes
const generateRandomPassword = (): string => {
  const passwordLength = 12; 
  return randomBytes(passwordLength).toString('base64');
};

// Function to create a secret in AWS Secrets Manager
const createSecret = async (secretName: string, secretValue: string): Promise<string|undefined> => {
  try {
    const secret = await secretsManager.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: secretValue,
    }));
    console.log(`Secret ${secretName} created successfully.`);
    return secret.ARN
  } catch (error) {
    console.error(`Error creating secret ${secretName}:`, error);
    throw error;
  }
};

// Function to retrieve the value of a secret from AWS Secrets Manager
const getSecretValue = async (secretArn: string): Promise<any> => {
  try {
    const result = await secretsManager.send(new GetSecretValueCommand({ SecretId: secretArn }));

    if (result.SecretString) {
      return JSON.parse(result.SecretString);
    } else {
      console.error(`Error: SecretString is undefined for ${secretArn}`);
      throw new Error(`SecretString is undefined for ${secretArn}`);
    }
  } catch (error) {
    console.error(`Error retrieving secret value for ${secretArn}:`, error);
    throw error;
  }
};

// Function to set an SSM parameter
const setSSMParameter = async (parameterName: string, parameterValue: string): Promise<string> => {
  try {
    await ssmClient.send(new PutParameterCommand({
      Name: parameterName,
      Value: parameterValue,
      Type: 'String',
      Overwrite: true,
    }));
    console.log(`SSM parameter ${parameterName} set successfully.`);
    return parameterValue;
  } catch (error) {
    console.error(`Error setting SSM parameter ${parameterName}:`, error);
    throw error;
  }
};

// Function to generate a random string of a specified length
const generateRandomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}
