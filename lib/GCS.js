import { Storage } from '@google-cloud/storage';

export function getStorage() {
    return new Storage({
        projectId: process.env.GCS_PROJECT_ID,
        credentials: {
            client_email: process.env.GCS_CLIENT_EMAIL,
            private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }
    });
}

export const bucket = getStorage().bucket(process.env.GCS_BUCKET_NAME);