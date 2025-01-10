import { Construct } from "constructs"
import { Repository } from "aws-cdk-lib/aws-codecommit";

export interface RepositoryConstructProps {
   envName: string
   repositoryName: string;
}

export class RepositoryConstruct extends Construct {
    public repositoryArn: string

    constructor(scope: Construct, id: string, props: RepositoryConstructProps) {
        super(scope, id)

        const repository = new Repository(this, `ecr-repository`, { repositoryName: props.repositoryName });
        this.repositoryArn = repository.repositoryArn;
            
    }
}
