import { Construct } from "constructs"
import { IVpc} from 'aws-cdk-lib/aws-ec2';
import { Aws, CustomResource, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Provider } from "aws-cdk-lib/custom-resources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export interface DatabaseInitConstructProps {
    envName: string
    databaseSecretArn: string | undefined
    databaseName: string
    unprivilegedUser: string
    vpc: IVpc
}

export class DatabaseInitConstruct extends Construct {
    public lambda: NodejsFunction;
    public customResource: CustomResource;

    constructor(scope: Construct, id: string, props: DatabaseInitConstructProps) {
        super(scope, id)


        // Lambda function for db initialization
        this.lambda = new NodejsFunction(this, 'init-aurora-db', {
            entry: 'lambdas/init-db/index.ts',
            vpc: props.vpc,
            handler: 'index.handler',
            timeout: Duration.minutes(2),
            runtime: Runtime.NODEJS_18_X,
            bundling: {
                minify: true,
                externalModules: [],
            },
            environment: {
                REGION: Aws.REGION,
                SECRET_ARN: props.databaseSecretArn!,
                UNPRIVILEGED_USER: props.unprivilegedUser,
                DATABASE: props.databaseName
              },
        });

        // Grant necessary permissions to the Lambda function
        this.lambda.addToRolePolicy(new PolicyStatement({
            resources: ['*'], 
            actions: [
                'rds-data:*',
                'secretsmanager:CreateSecret',
				'secretsmanager:ListSecrets',
				'secretsmanager:GetSecretValue',
				'secretsmanager:DescribeSecret',
                'ssm:GetParameter',
				'ssm:PutParameter',
				'ssm:DescribeParameters'
            ],
        }));

       

        // Custom Resource
        const customResourceProvider = new Provider(this, "init-aurora-db-script-custom-resource-provider", {
            onEventHandler: this.lambda,
            vpc: props.vpc,
            logRetention: RetentionDays.ONE_DAY,
            
          });
       
        this.customResource = new CustomResource(this, "init-aurora-db-script-custom-resource", {
            serviceToken: customResourceProvider.serviceToken,
            removalPolicy: RemovalPolicy.DESTROY,
            resourceType: 'Custom::DBCustomResource'
        });
        
    }
}
