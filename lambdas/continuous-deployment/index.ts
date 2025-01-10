import { ECRClient, DescribeImagesCommand } from "@aws-sdk/client-ecr";
import { ECSClient, UpdateServiceCommand } from "@aws-sdk/client-ecs";
import { CloudWatchLogsEvent } from "aws-lambda";

const ecr = new ECRClient();
const ecs = new ECSClient();

export const handler = async (event: CloudWatchLogsEvent) => {
  try {
    // Extract environment variables
    const ecrRepositoryName = process.env.ECR_REPOSITORY_NAME!;
    const ecsClusterName = process.env.ECS_CLUSTER_NAME!;
    const ecsServiceName = process.env.ECS_SERVICE_NAME!;

    // Get the latest image URI from ECR
    const latestImage = await getLatestECRImage(ecrRepositoryName);

    // Update the ECS service with the latest image
    await updateECSService(ecsClusterName, ecsServiceName, latestImage);

    return {
      statusCode: 200,
      body: "ECS service updated successfully.",
    };
  } catch (error) {
    console.error("Error updating ECS service:", error);
    return {
      statusCode: 500,
      body: "Error updating ECS service.",
    };
  }
};


async function getLatestECRImage(repositoryName: string): Promise<string> {
  try {
    const command = new DescribeImagesCommand({
      repositoryName,
    });
    const response = await ecr.send(command);

    if (response.imageDetails && response.imageDetails.length > 0) {
      const sortedImages = response.imageDetails.sort((a,b) => new Date(b.imagePushedAt ?? 0).getTime() - new Date(a.imagePushedAt ?? 0).getTime())

      const latestImage = sortedImages[0];
      if (latestImage.imageTags && latestImage.imageTags.length > 0) {
        const imageTag = latestImage.imageTags[0];
        // Construct the full image URI
        const accountId = process.env.AWS_ACCOUNT_ID!;
        const region = process.env.AWS_REGION || "eu-west-1";
        return `${accountId}.dkr.ecr.${region}.amazonaws.com/${repositoryName}:${imageTag}`;
      }
    }

    throw new Error("No images with tags found in the specified ECR repository.");
  } catch (error) {
    console.error("Error fetching the latest ECR image:", error);
    throw error;
  }
}

async function updateECSService(clusterName: string, serviceName: string, imageUri: string) {
  try {
    const command = new UpdateServiceCommand({
      cluster: clusterName,
      service: serviceName,
      forceNewDeployment: true,
      taskDefinition: `${serviceName}:${imageUri}`,
    });

    await ecs.send(command);
    console.log("ECS service updated successfully.");
  } catch (error) {
    console.error("Error updating ECS service:", error);
    throw error;
  }
}