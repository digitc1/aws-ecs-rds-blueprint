# ecs-rds-blueprint
The CDK app deploys a scalable AWS infrastructure for a containerized application using ECS with Fargate. It includes an Aurora PostgreSQL RDS database, an ECR repository from where the application will be taken, an ECS Fargate cluster, an Application Load Balancer (ALB) with HTTPS support, and DNS settings with Route 53. Users can easily deploy and manage the infrastructure using the provided CDK commands for each account environment, based on the configuration defined on the eng.ts file.

# Prerequisites
1. **AWS Profile**: Require an AWS CLI profile setup (with MFA) to connect to development account
2. **Node.js and npm**: Install Node.js and npm to run and deploy the CDK code (look at nvm).
3. **CDK CLI**: Install the AWS CDK CLI globally using npm:
```bash
npm install -g aws-cdk
```
4. **Route53 Hosted Zone**: An existing domain and hosted zone configured on the account where the application is to be deployed.
5. **App configuration**: Updating the env.ts file with valid parameters.

# Installation
Clone & Install this repository:
```bash
git clone <REPO>
cd ecs-rds-blueprint
npm install
```

# Boostrap


If not yet bootstrapped, execute in dev account:
```bash
npx cdk bootstrap aws://<AWSID>/eu-west-1 -c envName=dev --profile {{DEV_PROFILE_NAME}} # deploys the bootstrap stack with required resources for cross account deployment from devops

```

# Deploy


Deploy in development account:
```bash
npx cdk deploy -c envName=dev --profile {{DEV_PROFILE_NAME}}
```


## Other commands
```bash
# Generate a cloud assembly, including an AWS CloudFormation template for the stack.
cdk synth -c envName=dev --profile {{PROFILE_NAME}}
```

```bash
# Show differneces between local code and deployed application
cdk diff -c envName=dev --profile {{PROFILE_NAME}} 
```

# Bastion

After deploying this CDK app, a bastion server is provisioned to allow controlled access to the PostgreSQL database. This bastion server is accessible only via Systems Manager / Session Manager for security reasons (meaning that the host is not publicly available with an SSH port exposed)

## Remote access

To access it go to the AWS console, open AWS Systems Manager and then on the left menu look for

    > Node Management > Session Manager

On the Session Manager panel, clock on the **Start Session** button. From the target instances list, select ***bastion-host*** and finally click **Start Session**.

An ssh console will appear connected to the EC2 instance configured as bastion host by the CDK app.

This is a bare linux instance, therefore a few packages may be required to access the RDS PostgreSQL database. If it's the first time using it, elicit the following commands to install the PostgreSQL client tools.

```bash
sudo yum install https://download.postgresql.org/pub/repos/yum/reporpms/EL-7-x86_64/pgdg-redhat-repo-latest.noarch.rpm

sudo tee /etc/yum.repos.d/pgdg.repo<<EOF
[pgdg13]
name=PostgreSQL 13 for RHEL/CentOS 7 - x86_64
baseurl=http://download.postgresql.org/pub/repos/yum/13/redhat/rhel-7-x86_64
enabled=1
gpgcheck=0
EOF

sudo yum install -y postgresql13
```
Or any equivalent packages required for operational procedures.

## Database access

In order to connect to the provisioned Aurora PostgreSQL database via the bastion, after installing the necessary dependencies (see chapter above), the next step if to obtain the DB URL as well the root credentials. For that, go to the AWS console, open Secrets Manager select the secret generated during the DB provisioning, that corresponds to the root credentials of the database (which should have a name like **ECSRDSBlueprint???databaseaur**)

After opening the detail page, click on the *Retrieve Secret Value* and take note of the following details:

- username
- password
- host
- port

Go back to your ssh session on the bastion server (if needed go to the Session Manager panel, click on the **Start Session** button. From the target instances list, select ***bastion-host*** and finally click **Start Session**) then execute the following command:

```bash
psql -U {{USERNAME}} -h {{HOST:PORT}}
```
When requested, enter the password taken from above and the session with the postgreSQL database should be established.