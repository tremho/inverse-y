/**
 * Support for common S3 actions
 */

import {Log} from "../Logging/Logger"
import * as IOException from "../Exceptions/IOExceptions"

import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} from "@aws-sdk/client-s3";

const REGION = 'us-west-1'; // TODO: ultimately configurable
const s3Client = new S3Client({region: REGION})

/**
 * Put text into an S3 object at the given bucket and key
 * @param bucket
 * @param key
 * @param text
 */
export async function s3PutText(bucket:string, key:string, text:string)
{
    try {
        const response = await s3Client.send(
            new PutObjectCommand({Bucket: bucket, Key: key, Body: text})
        );
        const statusCode = response.$metadata.httpStatusCode;
        Log.Info('Response code from put command is ' + statusCode);

        if (statusCode !== 200) throw new IOException.PutFailed(`s3PutText Failed with statusCode=${statusCode}`)
    }
    catch(e:any) {
        Log.Exception(e);
        throw new IOException.PutFailed(`s3PutText Failed on exception: ${e.message}`);
    }
}

/**
 * Put an object as JSON into the given bucket and key
 * @param bucket
 * @param key
 * @param data
 */
export async function s3PutObject(bucket:string, key:string, data:any)
{
    try {
        const text = serialize(data);
        await s3PutText(bucket, key, text);
    }
    catch(e:any) {
        Log.Exception(e);
        throw new IOException.PutFailed(`s3PutJson Failed on exception: ${e.message}`)
    }
}

/**
 * Get a raw s3 response from the bucket and key
 * @param bucket
 * @param key
 */
export async function s3GetResponse(bucket:string, key:string)
{
    try {
        return await s3Client.send(
            new GetObjectCommand({Bucket:bucket, Key:key})
        )
    }
    catch(e:any) {
        Log.Exception(e);
        throw new IOException.GetFailed(`s3GetResponse Failed on exception: ${e.message}`)
    }

}

/**
 * Get text contained at the bucket/key
 * @param bucket
 * @param key
 */
export async function s3GetText(bucket:string, key:string):Promise<string>
{
    return s3ResolveResponseObject(await s3GetResponse(bucket, key));
}

/**
 * Get object from the JSON cantained in bucket/key
 * @param bucket
 * @param key
 */
export async function s3GetObject(bucket:string, key:string):Promise<any>
{
    return deserialize(await s3GetText(bucket, key));
}

/**
 * Delete the s3 object at bucket/key
 * @param bucket
 * @param key
 */
export async function s3Delete(bucket:string, key:string)
{
    try {
        const response = await s3Client.send(
            new DeleteObjectCommand( {Bucket: bucket, Key: key})
        )
        const statusCode = response.$metadata.httpStatusCode;
        Log.Info('Response code from delete command is ' + statusCode);

        if (statusCode !== 200) throw new IOException.DeleteFailed(`s3Delete Failed with statusCode=${statusCode}`)
    }
    catch(e:any)
    {
        Log.Exception(e);
        throw new IOException.DeleteFailed(`s3Delete Failed on exception: ${e.message}`)
    }
}

/**
 * Serialize object to json, or throw serialization exception
 * @param json
 */
export function serialize(json:any):string {
    try {
        return JSON.stringify(json);
    }
    catch(e) {
        throw new IOException.SerializationFailed();
    }
}

/**
 * Deserialize object to json or throw Deserialization exception
 * @param text
 */
export function deserialize(text:string):object {
    try {
        return JSON.parse(text);
    }
    catch(e) {
        throw new IOException.DeserializationFailed();
    }
}

const streamToString = (stream:any):Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks:any[] = [];
        stream.on("data", (chunk:any) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

/**
 * Resolve a raw response to JSON or string
 * @param response
 */
export async function s3ResolveResponseObject(response:any) {
    let data
    const body = response && response.Body
    if(body) {
        const str:string = await streamToString(body)
        if(str) {
            try {
                data = JSON.parse(str)
            } catch(e) {data = str} // if it's not json
        }
        return data
    }
}
