import {EC2} from '@aws-sdk/client-ec2'

const getTargetEC2Instances = async (ec2Client: EC2): Promise<any[]> => {
    const response = await ec2Client.describeInstances({
        Filters: [{ Name: 'tag:AutoStartStop', Values: ['TRUE'] }]
    });

    const targetInstances: any[] = [];

    if (response.Reservations) {
        for (const reservation of response.Reservations) {
            if (reservation.Instances && reservation.Instances.length > 0) {
                for (const instance of reservation.Instances) {
                    if (instance.State && (instance.State.Name === 'running' || instance.State.Name === 'stopped')) {
                        let instanceName = '';

                        if (instance.Tags) {
                            const nameTag = instance.Tags.find(tag => tag.Key === 'Name');
                            if (nameTag) {
                                instanceName = nameTag.Value || '';
                            }
                        }

                        targetInstances.push({
                            instance_id: instance.InstanceId || '',
                            instance_name: instanceName
                        });
                    }
                }
            }
        }
    }

    return targetInstances;
};

const startStopInstance = async (ec2Client: EC2, instance: any, action: string): Promise<boolean> => {
    if (action === 'start') {
        return startInstance(ec2Client, instance);
    } else if (action === 'stop') {
        return stopInstance(ec2Client, instance);
    } else {
        console.log('Invalid action.');
        return false;
    }
};

const startInstance = async (ec2Client: EC2, instance: any): Promise<boolean> => {
    try {
        console.log(`starting instance (ID: ${instance.instance_id} Name: ${instance.instance_name})`);

        const res = await ec2Client.startInstances({ InstanceIds: [instance.instance_id] });
        console.log(res);

        return true;
    } catch (error) {
        console.log('[ERROR] failed to start an EC2 instance.');
        console.log(error);
        return false;
    }
};

const stopInstance = async (ec2Client: EC2, instance: any): Promise<boolean> => {
    try {
        console.log(`stopping instance (ID: ${instance.instance_id} Name: ${instance.instance_name})`);

        const res = await ec2Client.stopInstances({ InstanceIds: [instance.instance_id] });
        console.log(res);

        return true;
    } catch (error) {
        console.log('[ERROR] failed to stop an EC2 instance.');
        console.log(error);
        return false;
    }
};

const returnResponse = (statusCode: number, message: string): any => {
    return {
        statusCode: statusCode,
        message: message
    };
};

export const handler = async (event: any): Promise<any> => {
    try {

        const action = event.Action;

        if (action !== 'start' && action !== 'stop') {
            const message = 'Invalid action. "action" support "start" or "stop".';
            console.log(message);
            return returnResponse(400, message);
        }

        const client = new EC2();
        const target_instances = await getTargetEC2Instances(client)

        if (target_instances.length === 0) {
            const message = `There are no instances subject to automatic ${action}.`;
            console.log(message);
            return returnResponse(200, message);
        }

        for (const instance of target_instances) {
            await startStopInstance(client, instance, action);
        }

        return {
            statusCode: 200,
            message: `Finished automatic ${action} EC2 instances process. [Region: ${event.Region}, Action: ${event.Action}]`
        };
    } catch (error) {
        console.log(error);
        return {
            statusCode: 500,
            message: 'An error occurred at automatic start / stop EC2 instances process.'
        };
    }
};
