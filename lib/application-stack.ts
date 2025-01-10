import { Stack, StackProps } from 'aws-cdk-lib';
import { Port} from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { RepositoryConstruct } from './constructs/repository-construct';
import { VpcConstruct } from './constructs/vpc-construct';
import { DatabaseConstruct } from './constructs/database-construct';
import { ComputeConstruct } from './constructs/compute-construct';
import { BastionConstruct } from './constructs/bastion-construct';
import { DatabaseInitConstruct } from './constructs/utils/database-init-construct';
import { ContinuousDeploymentConstruct } from './constructs/utils/continuous-deployment-construct';

// Interface for stack properties
interface ApplicationStackProps extends StackProps {
  envName: string
  domainName: string;
  repositoryName: string;
  isProduction: boolean
  databaseName: string
  databaseUser: string
  containerPort: number
  bastionStop: string
  bastionStart: string
}

// AWS CDK Stack class for the backend infrastructure
export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);


    // Create a ECR for ECS
    const repositoryConstruct = new RepositoryConstruct(this, `${props.envName}-ecr`, {envName : props.envName, repositoryName: props.repositoryName})
    

    // Create a VPC for ECS and RDS
    const vpcConstruct = new VpcConstruct(this, `${props.envName}-vpc`, {envName : props.envName})
    
    // Create DatabaseConstruct for managing RDS
    const databaseConstruct = new DatabaseConstruct(this, `${props.envName}-database`, {
      envName: props.envName,
      databaseName: props.databaseName,
      databaseUser: props.databaseUser,
      vpc: vpcConstruct.vpc,
      securityGroup: vpcConstruct.securityGroup,
      isProduction: props.isProduction
    })

    // Create DatabaseInitConstruct for initializing the database
    const databaseInitConstruct = new DatabaseInitConstruct(this, `${props.envName}-database-init`, {
      envName: props.envName, 
      databaseSecretArn: databaseConstruct.dbCluster.secret?.secretArn,
      databaseName: props.databaseName,
      unprivilegedUser: props.databaseUser,
      vpc: vpcConstruct.vpc,
    })

    // Create BastionConstruct for managing bastion host
    const bastionConstruct = new BastionConstruct(this, `${props.envName}-bastion`, {
      envName: props.envName,
      vpc: vpcConstruct.vpc,
      bastionStop: props.bastionStop,
      bastionStart: props.bastionStart
    })

   
    // Create ComputeConstruct for managing ECS and related components
    const computeConstruct = new ComputeConstruct(this, `${props.envName}-compute`, {
      envName: props.envName,
      domainName: props.domainName,
      vpc: vpcConstruct.vpc,
      securityGroup: vpcConstruct.securityGroup,
      databaseHost: databaseConstruct.dbCluster.clusterEndpoint.hostname,
      databaseName: props.databaseName,
      databaseUser: props.databaseUser,
      ecrRepositoryName: props.repositoryName,
      ecrRepositoryArn: repositoryConstruct.repositoryArn,
      containerPort: props.containerPort
    })

    const continuousDeploymentConstruct = new ContinuousDeploymentConstruct(this,  `${props.envName}-ecs-deployment`, {
        envName: props.envName,
        vpc: vpcConstruct.vpc,
        ecrRepositoryName: props.repositoryName,
        fargateService: computeConstruct.fargateService
    })

    // Ensure that the repositoryConstruct is deployed first
    vpcConstruct.node.addDependency(repositoryConstruct)

    // Ensure that the computeConstruct is deployed after databaseInitConstruct
    computeConstruct.node.addDependency(databaseInitConstruct.customResource)
    
    //Allow the ECS service to connect to the RDS database
    databaseConstruct.dbCluster.connections.allowFrom(computeConstruct.fargateService, Port.tcp(5432), 'Allow ECS to connect to RDS');

    // Grant necessary permissions for the bastion host to access the RDS database
    databaseConstruct.dbCluster.connections.allowFrom(bastionConstruct.bastionHost, Port.tcp(5432), 'Allow Bastion Host to connect to RDS');

    // Grant necessary permissions for the init lambda to access the RDS database
    databaseConstruct.dbCluster.connections.allowFrom(databaseInitConstruct.lambda, Port.tcp(5432), 'Allow Lambda to connect to RDS');

    
  }

}
