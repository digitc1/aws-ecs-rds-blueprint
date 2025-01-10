import { Construct } from "constructs"
import { BastionHostLinux, IInstance, IVpc } from 'aws-cdk-lib/aws-ec2';
import { CfnDocument } from "aws-cdk-lib/aws-ssm";
import { readFileSync } from "fs";
import { Function, InlineCode, Runtime } from "aws-cdk-lib/aws-lambda";
import { Duration, Tags } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Rule, RuleTargetInput, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export interface BastionConstructProps {
    envName: string
    vpc: IVpc
    bastionStop: string
    bastionStart: string
}

export class BastionConstruct extends Construct {

    public bastionHost: IInstance
    constructor(scope: Construct, id: string, props: BastionConstructProps) {
        super(scope, id)
        this.bastionHost = new BastionHostLinux(this, "bastion-host", {
            vpc: props.vpc,
            instanceName: "bastion-host",
        })
        
        Tags.of(this.bastionHost).add('AutoStartStop', 'TRUE');

        // Add the bastion host to Systems Manager (SSM)
        const ssmDocument = new CfnDocument(this, 'ssm-document', {
            name: `ecs-rds-blueprint-${props.envName}-ssm-document`,
            documentType: 'Command',
            content: {
                schemaVersion: '2.2',
                description: 'Install the SSM agent on Amazon Linux 2',
                mainSteps: [
                    {
                        action: 'aws:runShellScript',
                        name: 'runShellScript',
                        inputs: {
                            runCommand: [
                                'curl https://d1wk0tztpsntt1.cloudfront.net/linux/latest/install -o /tmp/ssm-agent-install',
                                'sudo sh /tmp/ssm-agent-install',
                            ],
                        },
                    },
                ],
            },
        });
        
        const lambda = new NodejsFunction(this, 'start-stop-bastion', {
            entry: 'lambdas/start-stop/index.ts',
            vpc: props.vpc,
            handler: 'index.handler',
            timeout: Duration.minutes(2),
            runtime: Runtime.NODEJS_18_X,
            bundling: {
                minify: true,
                externalModules: [],
            },
        });

        lambda.addToRolePolicy(new PolicyStatement({
            actions: [
                'ec2:DescribeInstances',
                'ec2:StartInstances',
                'ec2:StopInstances'
            ],
            resources: ['*']
        }));

        // STOP EC2 instances rule
        const stopRule = new Rule(this, 'StopRule', {
            schedule: Schedule.expression(`cron(${props.bastionStop})`)
        });

        stopRule.addTarget(new LambdaFunction(lambda, {
            event: RuleTargetInput.fromObject({ Instance: [this.bastionHost.instanceId], Action: 'stop' })
        }));

        // START EC2 instances rule
        const startRule = new Rule(this, 'StartRule', {
            schedule: Schedule.expression(`cron(${props.bastionStart})`)
        });

        startRule.addTarget(new LambdaFunction(lambda, {
            event: RuleTargetInput.fromObject({ Instance: [this.bastionHost.instanceId], Action: 'start' })
        }));

    }
}
