#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsAppStack } from '../lib/productsApp-stack';
import { EcommerceApiStack } from '../lib/ecommerceApi-stack';
import * as dotenv from "dotenv"

dotenv.config()

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.account,
  region: "us-east-1"
}

const tags = {
  cost: "Ecommerce",
  team: "FrancineHahn"
}

const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  tags: tags,
  env: env
})

const ecommerceApiStack = new EcommerceApiStack(app, "EcommerceApi", {
  productsFetchHandler: productsAppStack.producstFetchHandler,
  tags: tags,
  env: env
})

ecommerceApiStack.addDependency(productsAppStack)