import { Construct } from "constructs"
import { FargateService } from "aws-cdk-lib/aws-ecs";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Duration } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

export interface ContinuousDeploymentConstructProps {
    envName: string
    vpc: IVpc
    ecrRepositoryName: string
    fargateService: FargateService
}

export class ContinuousDeploymentConstruct extends Construct {

    constructor(scope: Construct, id: string, props: ContinuousDeploymentConstructProps) {
        super(scope, id)
        
        // Lambda function to perform the deployment
        const lambda = new NodejsFunction(this, 'start-stop-bastion', {
            entry: 'lambdas/continuous-deployment/index.ts',
            vpc: props.vpc,
            handler: 'index.handler',
            timeout: Duration.minutes(2),
            runtime: Runtime.NODEJS_18_X,
            bundling: {
                minify: true,
                externalModules: [],
            },
            environment: {
                ECS_CLUSTER_NAME: props.fargateService.cluster.clusterName,
                ECS_SERVICE_NAME: props.fargateService.serviceName,
                ECR_REPOSITORY_NAME: props.ecrRepositoryName,
              },
        });

        // Add permissions for ECR and ECS
        lambda.addToRolePolicy(
            new PolicyStatement({
            actions: [
                "ecr:DescribeImages", 
                "ecr:GetAuthorizationToken",
            ],
            resources: ["*"], // Replace with specific ECR repository ARNs if desired (could be passed as param)
            })
        );
        
        lambda.addToRolePolicy(
            new PolicyStatement({
            actions: [
                "ecs:UpdateService", 
                "ecs:DescribeServices",
                "ecs:DescribeTaskDefinition", 
            ],
            resources: ["*"], // Replace with specific ECS ARNs if desired (could be passed as param)
            })
        );

        //Create CloudWatch Event Rule
        const rule = new Rule(this, 'ecs-trigger-rule',{
            eventPattern: {
                source: ['aws:ecr'],
                detail: {
                    result: "SUCCESS",
                    repositoryName: props.ecrRepositoryName,
                    actionType: "PUSH",
                    imageTag: "latest"
                }
            }
        })

        rule.addTarget(new LambdaFunction(lambda))
    }
}
