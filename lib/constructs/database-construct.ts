import { Construct } from "constructs"
import { IVpc, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { AuroraPostgresEngineVersion, ClusterInstance, DatabaseCluster, DatabaseClusterEngine } from "aws-cdk-lib/aws-rds";
import { RemovalPolicy } from "aws-cdk-lib";


export interface DatabaseConstructProps {
    envName: string
    databaseName: string
    databaseUser: string
    vpc: IVpc
    securityGroup: SecurityGroup
    isProduction: boolean
}

export class DatabaseConstruct extends Construct {
    public dbCluster: DatabaseCluster

    constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
        super(scope, id)

        // Create an Aurora PostgreSQL RDS database cluster with a master and a replica
        this.dbCluster = new DatabaseCluster(this, 'aurora-cluster', {
            engine: DatabaseClusterEngine.auroraPostgres({
                version: AuroraPostgresEngineVersion.VER_15_3
            }),

            vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            vpc: props.vpc,
            securityGroups: [props.securityGroup],
            writer: ClusterInstance.serverlessV2(`aurora-cluster-instance-writer`, {}),
            readers: [
                ClusterInstance.serverlessV2(`aurora-cluster-instance-readers`, { scaleWithWriter: true }),
            ],
            // writer: ClusterInstance.provisioned(`aurora-cluster-instance-writer`, {
            //     instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM), 
            // }),
            // readers: [
            //     ClusterInstance.provisioned(`aurora-cluster-instance-readers`, {
            //         instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MEDIUM), 
            //     }),
            // ],
            defaultDatabaseName: props.databaseName,
            removalPolicy: props.isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
        });

    }
}
