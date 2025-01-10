const baseDomainName = 'finops.c1tickets.eu'
const ecrName = 'ecs-rds-blueprint'

export const ACCOUNTS = {
    dev: "496456535410"
}

export const ENV = {
    
    dev: {
        account: ACCOUNTS.dev,
        region: 'eu-west-1',
        domainName: `${baseDomainName}`, // add prefix if needed like `dev.${baseDomainName}`
        envName: 'dev',
        repositoryName: ecrName,
        isProduction: false,
        databaseName: 'ECSRDSBlueprint', //no symbols allowed
        databaseUser: 'ecs-rds-blueprint',
        containerPort: 4567,
        bastionStop: "55 23 ? * * *",
        bastionStart: "0 8 ? * * *"
    }
}
