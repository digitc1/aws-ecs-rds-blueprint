import { Construct } from "constructs"
import { IVpc, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';

export interface VpcConstructProps {
   envName: string
}

export class VpcConstruct extends Construct {
    public vpc: IVpc
    public securityGroup: SecurityGroup

    constructor(scope: Construct, id: string, props: VpcConstructProps) {
        super(scope, id)

        // Create a VPC for ECS and RDS
        this.vpc = new Vpc(this, `vpc`, { maxAzs: 2 })
        
        // Create security group for ALB
        this.securityGroup = new SecurityGroup(this, `security-group`, { vpc: this.vpc })
    }
}
