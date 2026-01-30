/**
 * Tenant Middleware Tests
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import express from "express";
import request from "supertest";
import { createTenantMiddleware } from "../../../src/middleware/tenant.js";
import type { TenantConfig } from "../../../src/config.js";
import { TEST_TENANTS } from "@agilehead/persona-test-utils";

describe("Tenant Middleware", () => {
  function createTestApp(tenantConfig: TenantConfig) {
    const app = express();
    app.use(createTenantMiddleware(tenantConfig));
    app.get("/test", (req, res) => {
      res.json({ tenant: req.tenant });
    });
    return app;
  }

  describe("Single Tenant Mode", () => {
    const singleTenantConfig: TenantConfig = {
      mode: "single",
      tenants: [TEST_TENANTS.DEFAULT],
    };

    it("should set implicit tenant when no tenant param provided", async () => {
      const app = createTestApp(singleTenantConfig);

      const response = await request(app).get("/test");

      expect(response.status).to.equal(200);
      expect(response.body.tenant).to.equal(TEST_TENANTS.DEFAULT);
    });

    it("should reject request when tenant param is provided", async () => {
      const app = createTestApp(singleTenantConfig);

      const response = await request(app).get("/test?tenant=some-tenant");

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal(
        "tenant parameter not allowed in single-tenant mode",
      );
    });

    it("should reject request with empty tenant param", async () => {
      const app = createTestApp(singleTenantConfig);

      // Empty tenant param should still trigger the "param provided" error
      const response = await request(app).get("/test?tenant=");

      // This tests the edge case - empty string is technically "provided"
      // The middleware should treat empty string as "provided but invalid"
      expect(response.status).to.equal(400);
    });
  });

  describe("Multi Tenant Mode", () => {
    const multiTenantConfig: TenantConfig = {
      mode: "multi",
      tenants: [TEST_TENANTS.APP1, TEST_TENANTS.APP2],
    };

    it("should accept valid tenant param", async () => {
      const app = createTestApp(multiTenantConfig);

      const response = await request(app).get(
        `/test?tenant=${TEST_TENANTS.APP1}`,
      );

      expect(response.status).to.equal(200);
      expect(response.body.tenant).to.equal(TEST_TENANTS.APP1);
    });

    it("should accept different valid tenant", async () => {
      const app = createTestApp(multiTenantConfig);

      const response = await request(app).get(
        `/test?tenant=${TEST_TENANTS.APP2}`,
      );

      expect(response.status).to.equal(200);
      expect(response.body.tenant).to.equal(TEST_TENANTS.APP2);
    });

    it("should reject request without tenant param", async () => {
      const app = createTestApp(multiTenantConfig);

      const response = await request(app).get("/test");

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("tenant parameter required");
    });

    it("should reject request with empty tenant param", async () => {
      const app = createTestApp(multiTenantConfig);

      const response = await request(app).get("/test?tenant=");

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("tenant parameter required");
    });

    it("should reject invalid tenant", async () => {
      const app = createTestApp(multiTenantConfig);

      const response = await request(app).get("/test?tenant=unknown-tenant");

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("invalid tenant");
    });

    it("should reject tenant not in allowed list", async () => {
      const app = createTestApp(multiTenantConfig);

      // TEST_TENANTS.DEFAULT is not in the multi-tenant config
      const response = await request(app).get(
        `/test?tenant=${TEST_TENANTS.DEFAULT}`,
      );

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("invalid tenant");
    });
  });

  describe("Edge Cases", () => {
    it("should handle tenant param with special characters", async () => {
      const multiTenantConfig: TenantConfig = {
        mode: "multi",
        tenants: ["tenant-with-dash", "tenant_with_underscore"],
      };
      const app = createTestApp(multiTenantConfig);

      const response1 = await request(app).get("/test?tenant=tenant-with-dash");
      expect(response1.status).to.equal(200);
      expect(response1.body.tenant).to.equal("tenant-with-dash");

      const response2 = await request(app).get(
        "/test?tenant=tenant_with_underscore",
      );
      expect(response2.status).to.equal(200);
      expect(response2.body.tenant).to.equal("tenant_with_underscore");
    });

    it("should handle URL-encoded tenant param", async () => {
      const multiTenantConfig: TenantConfig = {
        mode: "multi",
        tenants: ["tenant-app"],
      };
      const app = createTestApp(multiTenantConfig);

      const response = await request(app).get("/test?tenant=tenant%2Dapp");

      expect(response.status).to.equal(200);
      expect(response.body.tenant).to.equal("tenant-app");
    });
  });
});
