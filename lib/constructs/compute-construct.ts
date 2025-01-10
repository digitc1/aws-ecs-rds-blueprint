import { Construct } from "constructs"
import { IVpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import { Cluster, ContainerImage, FargateService, FargateTaskDefinition, LogDriver, ScalableTaskCount } from "aws-cdk-lib/aws-ecs";
import { IRepository, Repository } from "aws-cdk-lib/aws-ecr";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { ApplicationLoadBalancer, ApplicationProtocol, ListenerCertificate } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import { Duration } from "aws-cdk-lib";
import { ServiceNamespace } from "aws-cdk-lib/aws-applicationautoscaling";
import { Policy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

export interface ComputeConstructProps {
    envName: string
    domainName: string
    vpc: IVpc
    securityGroup: SecurityGroup
    databaseHost: string
    databaseName: string
    databaseUser: string
    ecrRepositoryArn: string
    ecrRepositoryName: string
    containerPort: number
}

export class ComputeConstruct extends Construct {
    public fargateService: FargateService

    constructor(scope: Construct, id: string, props: ComputeConstructProps) {
        super(scope, id)


        // Create an ECR repository to store the Docker image
        const ecrRepository = Repository.fromRepositoryAttributes(this, 'repository-arn', {
            repositoryName: props.ecrRepositoryName,
            repositoryArn: props.ecrRepositoryArn
        })

        // Create an ECS Fargate cluster
        const cluster = new Cluster(this, `ecs-cluster`, { vpc: props.vpc })

        // Get PostgreSQL unprivileged user secret
        const unprivilegedSecretArn = StringParameter.valueForStringParameter(this, '/eu/ecs-rds-blueprint/rds/unprivileged-user/secret/arn');
        const dbSecret = Secret.fromSecretCompleteArn(this, `rds-${props.databaseUser}-secret`, unprivilegedSecretArn);

        // Create an ECS Fargate task definition
        const taskDefinition = this.createTaskDefinition(
            ecrRepository,
            props.databaseHost,
            props.databaseName,
            props.databaseUser,
            dbSecret,
            props.containerPort
        );

        // Create an ECS Fargate service
        this.fargateService = new FargateService(this, `fargate-service`, {
            cluster,
            taskDefinition,
            securityGroups: [props.securityGroup],
        })

        // Specify the IAM role for autoscaling
        const taskRole = new Role(this, 'task-role', {
            assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'), // The service principal for ECS tasks
        });

        // Attach a custom policy to the role
        taskRole.attachInlinePolicy(
            new Policy(this, 'additional-ssm-policy', {
                statements: [
                    new PolicyStatement({
                        actions: [
                            'ecs:UpdateService', 
                            'ecs:DescribeServices', 
                            'ecs:DescribeTaskDefinition',
                            'ecs:DescribeClusters',
                            'ecs:ListTasks', 
                            'ecs:ListClusters',
                            'cloudwatch:PutMetricAlarm',
                            'cloudwatch:DescribeAlarms',
                            'autoscaling:DescribeAutoScalingGroups',
                            'autoscaling:SetDesiredCapacity', 
                        ],
                        resources: ['*'], // Adjust resource ARNs as needed
                    }),
                ],
            })
        );


        // Create a scalable task count for autoscaling
        const scalableTaskCount = new ScalableTaskCount(this, `scalable-task-count`, {
            serviceNamespace: ServiceNamespace.ECS,
            resourceId: `service/${cluster.clusterName}/${this.fargateService.serviceName}`,
            minCapacity: 1,
            maxCapacity: 2,
            dimension: 'ecs:service:DesiredCount',
            role: taskRole
        });

        // Configure scaling based on CPU utilization
        scalableTaskCount.scaleOnCpuUtilization(
            'scalable-task-count-autoscaling-on-cpu-utilization',
            {
                targetUtilizationPercent: 80,
                scaleInCooldown: Duration.seconds(300),
                scaleOutCooldown: Duration.seconds(60),
            }
        );
        
        // Configure scaling based on memory utilization
        scalableTaskCount.scaleOnMemoryUtilization(
            'scalable-task-count-autoscaling-on-memory-utilization',
            {
                targetUtilizationPercent: 80,
                scaleInCooldown: Duration.seconds(300),
                scaleOutCooldown: Duration.seconds(60),
            }
        );

        // Reference existing hosted zone
        const hostedZone = HostedZone.fromLookup(this,
            `hostedZone`,
            { domainName: props.domainName }
        )

        // Create an ACM certificate for HTTPS
        const certificateArn = new Certificate(this, `certificate`, {
            certificateName: `ECS-RDS-Blueprint-${props.envName}`,
            domainName: props.domainName,
            subjectAlternativeNames: [
                `*.${props.domainName}`],
            validation: CertificateValidation.fromDns(hostedZone),
        }).certificateArn

        // Create an ALB
        const alb = new ApplicationLoadBalancer(this, `alb`, {
            vpc: props.vpc,
            internetFacing: true,
            securityGroup: props.securityGroup,
        })

        // Create a listener for the ALB with HTTPS
        const listener = alb.addListener(`alb-listener`, {
            port: 443,
            open: true,
            certificates: [ListenerCertificate.fromArn(certificateArn)],
        })

        // Attach the ECS service to the ALB
        listener.addTargets(`ecs-to-alb`, {
            port: props.containerPort,
            protocol: ApplicationProtocol.HTTP,
            targets: [this.fargateService],
        })

        // Create an A record in the specified hosted zone
        new ARecord(this, `a-record`, {
            recordName: 'backend',
            zone: hostedZone,
            target: RecordTarget.fromAlias(new LoadBalancerTarget(alb)),
        });


    }

    /**
     * Creates a Fargate task definition for the ECS service.
     * @param ecrRepository - The ECR repository containing the Docker image.
     * @param dbHost - The host address of the database.
     * @param dbName - The name of the database.
     * @param dbUser - The username for the database connection.
     * @param dbSecret - The secret containing the database password.
     * @param containerPort - The port to map to the container.
     * @returns The created Fargate task definition.
     */
    private createTaskDefinition(ecrRepository: IRepository, dbHost: string, dbName: string, dbUser: string, dbSecret: ISecret, containerPort: number): FargateTaskDefinition {
        // Create a Fargate task definition
        const taskDefinition = new FargateTaskDefinition(this, `task-definition`);

        // Add a container to the task definition
        const container = taskDefinition.addContainer(`container`, {
            image: ContainerImage.fromEcrRepository(ecrRepository),
            logging: LogDriver.awsLogs({ streamPrefix: 'container-logs' }),
            environment: {
                // Pass the database connection information to the container as environment variables
                DB_HOST: dbHost,
                DB_PORT: '5432',
                DB_USER: dbUser, // default admin user
                DB_PASSWORD: dbSecret.secretArn, //TODO: Should pass ARN instead, using this just for test
                DB_DATABASE: dbName
            },
        });

        // Define container port mapping
        container.addPortMappings({ containerPort: containerPort });

        return taskDefinition;
    }

}
