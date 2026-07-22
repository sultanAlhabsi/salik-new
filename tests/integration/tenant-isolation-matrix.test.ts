import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app";
import { tenantIsolationEvidence } from "./tenant-isolation-evidence";
import { useTestApp, type TestContext } from "./helpers";

async function loginAgent(context: TestContext, email: string) {
  const agent = request.agent(createApp({ prisma: context.prisma }));
  const login = await agent.post("/api/auth/login").send({
    email,
    password: context.seed.password,
  });
  expect(login.status).toBe(200);
  return agent;
}

async function createTenantGraph(context: TestContext) {
  const secondStore = await context.factories.organization({
    type: "STORE",
    name: "Second Tenant Store",
  });
  const secondStoreUser = await context.factories.user({
    email: "admin@second-store.test",
    name: "Second Store Admin",
    role: "STORE_ADMIN",
    organizationId: secondStore.id,
  });
  const secondStoreAddress = await context.factories.address({
    organizationId: secondStore.id,
    type: "SHIPPING",
    isDefault: true,
  });
  const secondStoreCart = await context.prisma.cart.create({
    data: { storeId: secondStore.id, userId: secondStoreUser.id },
  });
  const beverageOrder = await context.factories.order({
    supplierId: context.seed.organizations.beverageSupplier.id,
    storeId: secondStore.id,
    createdById: secondStoreUser.id,
    deliveryAddressId: secondStoreAddress.id,
    productId: context.seed.products.beverageWater.id,
    status: "READY_FOR_DELIVERY",
  });
  const beverageInvoice = await context.prisma.invoice.create({
    data: {
      orderId: beverageOrder.id,
      supplierId: beverageOrder.supplierId,
      storeId: beverageOrder.storeId,
      invoiceNumber: `INV-${beverageOrder.id}`,
      subtotalBaisa: beverageOrder.subtotalBaisa,
      taxBaisa: beverageOrder.taxBaisa,
      totalBaisa: beverageOrder.totalBaisa,
    },
  });
  const beverageDelivery = await context.prisma.delivery.create({
    data: {
      supplierId: beverageOrder.supplierId,
      storeId: beverageOrder.storeId,
      orderId: beverageOrder.id,
      driverId: context.seed.users.beverageDriver.id,
      status: "FAILED",
      failureReason: "Tenant test setup",
    },
  });
  const firstStoreCart = await context.prisma.cart.findFirstOrThrow({
    where: {
      storeId: context.seed.organizations.alNoorStore.id,
      userId: context.seed.users.storeAdmin.id,
      status: "ACTIVE",
    },
  });
  const firstStoreCartItem = await context.prisma.cartItem.create({
    data: {
      cartId: firstStoreCart.id,
      productId: context.seed.products.freshMilk.id,
      supplierId: context.seed.organizations.freshSupplier.id,
      userId: context.seed.users.storeAdmin.id,
      quantity: 1,
    },
  });
  const secondStoreCartItem = await context.prisma.cartItem.create({
    data: {
      cartId: secondStoreCart.id,
      productId: context.seed.products.beverageWater.id,
      supplierId: context.seed.organizations.beverageSupplier.id,
      userId: secondStoreUser.id,
      quantity: 1,
    },
  });
  const firstRecurring = await context.prisma.recurringOrder.create({
    data: {
      storeId: context.seed.organizations.alNoorStore.id,
      supplierId: context.seed.organizations.freshSupplier.id,
      userId: context.seed.users.storeAdmin.id,
      deliveryAddressId: context.seed.addresses.storeShipping.id,
      name: "First store recurring",
      cadenceDays: 7,
      nextRunAt: new Date(Date.now() + 86_400_000),
      paymentMethod: "INVOICE",
      items: { create: { productId: context.seed.products.freshMilk.id, quantity: 1 } },
    },
  });
  const secondRecurring = await context.prisma.recurringOrder.create({
    data: {
      storeId: secondStore.id,
      supplierId: context.seed.organizations.beverageSupplier.id,
      userId: secondStoreUser.id,
      deliveryAddressId: secondStoreAddress.id,
      name: "Second store recurring",
      cadenceDays: 14,
      nextRunAt: new Date(Date.now() + 86_400_000),
      paymentMethod: "INVOICE",
      items: { create: { productId: context.seed.products.beverageWater.id, quantity: 1 } },
    },
  });
  const firstNotification = await context.prisma.notification.create({
    data: {
      organizationId: context.seed.organizations.alNoorStore.id,
      entityType: "order",
      entityId: context.seed.seededOrder.id,
      title: "First store only",
      body: "Private notification",
    },
  });
  const secondNotification = await context.prisma.notification.create({
    data: {
      organizationId: secondStore.id,
      entityType: "order",
      entityId: beverageOrder.id,
      title: "Second store only",
      body: "Private notification",
    },
  });
  const secondAttachment = await context.prisma.attachment.create({
    data: {
      ownerOrgId: secondStore.id,
      uploadedById: secondStoreUser.id,
      entityType: "order",
      entityId: beverageOrder.id,
      filename: "private.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
      storagePath: "storage/test/private.pdf",
    },
  });
  const beverageCategory = await context.prisma.productCategory.findFirstOrThrow({
    where: { supplierId: context.seed.organizations.beverageSupplier.id },
  });
  const beverageWarehouse = await context.prisma.warehouse.findFirstOrThrow({
    where: { supplierId: context.seed.organizations.beverageSupplier.id },
  });

  return {
    secondStore,
    secondStoreUser,
    secondStoreAddress,
    beverageOrder,
    beverageInvoice,
    beverageDelivery,
    beverageCategory,
    beverageWarehouse,
    firstStoreCartItem,
    secondStoreCartItem,
    firstRecurring,
    secondRecurring,
    firstNotification,
    secondNotification,
    secondAttachment,
  };
}

describe("tenant and entity isolation evidence matrix", () => {
  const context = useTestApp();

  it("documents read and write evidence for every scoped entity family", () => {
    expect(tenantIsolationEvidence.map((item) => item.family)).toEqual([
      "products",
      "categories",
      "warehouses",
      "inventory",
      "orders",
      "cart",
      "recurring",
      "delivery",
      "invoice",
      "file",
      "notification",
      "report",
      "organization",
      "driver",
    ]);
    expect(tenantIsolationEvidence.every((item) => item.read && item.write)).toBe(true);
  });

  it("isolates supplier reads and writes across all supplier-owned families", async () => {
    const graph = await createTenantGraph(context);
    const fresh = await loginAgent(context, "supplier@fresh.om");
    const [products, categories, warehouses, inventory, orders, deliveries] = await Promise.all([
      fresh.get("/api/supplier/products"),
      fresh.get("/api/supplier/categories"),
      fresh.get("/api/supplier/warehouses"),
      fresh.get("/api/supplier/inventory"),
      fresh.get("/api/supplier/orders"),
      fresh.get("/api/supplier/deliveries"),
    ]);
    const serialized = JSON.stringify({
      products: products.body,
      categories: categories.body,
      warehouses: warehouses.body,
      inventory: inventory.body,
      orders: orders.body,
      deliveries: deliveries.body,
    });
    expect(serialized).not.toContain(context.seed.products.beverageWater.id);
    expect(serialized).not.toContain(graph.beverageCategory.id);
    expect(serialized).not.toContain(graph.beverageWarehouse.id);
    expect(serialized).not.toContain(graph.beverageOrder.id);
    expect(serialized).not.toContain(graph.beverageDelivery.id);

    const foreignProduct = await fresh.get(`/api/supplier/products/${context.seed.products.beverageWater.id}`);
    const missingProduct = await fresh.get("/api/supplier/products/nonexistent-product");
    expect(foreignProduct.status).toBe(404);
    expect(foreignProduct.body).toEqual(missingProduct.body);

    const productBefore = await context.prisma.product.findUniqueOrThrow({ where: { id: context.seed.products.beverageWater.id } });
    const stockBefore = await context.prisma.inventoryStock.findFirstOrThrow({ where: { productId: context.seed.products.beverageWater.id } });
    expect((await fresh.patch(`/api/supplier/products/${productBefore.id}`).send({ name: "Stolen name" })).status).toBe(404);
    expect((await fresh.patch(`/api/supplier/categories/${graph.beverageCategory.id}`).send({ name: "Stolen category" })).status).toBe(404);
    expect((await fresh.patch(`/api/supplier/warehouses/${graph.beverageWarehouse.id}`).send({ name: "Stolen warehouse" })).status).toBe(404);
    expect((await fresh.post("/api/supplier/inventory/adjust").send({
      productId: context.seed.products.beverageWater.id,
      warehouseId: graph.beverageWarehouse.id,
      quantity: 1,
      type: "ADJUSTMENT_IN",
      idempotencyKey: "foreign-stock-adjustment",
    })).status).toBe(404);
    expect((await fresh.post(`/api/supplier/orders/${graph.beverageOrder.id}/transition`).send({ status: "ACCEPTED" })).status).toBe(404);
    expect((await fresh.post(`/api/supplier/deliveries/${graph.beverageDelivery.id}/reschedule`).send({ scheduledFor: new Date(Date.now() + 86_400_000) })).status).toBe(404);

    expect(await context.prisma.product.findUniqueOrThrow({ where: { id: productBefore.id } })).toEqual(productBefore);
    expect(await context.prisma.inventoryStock.findUniqueOrThrow({ where: { id: stockBefore.id } })).toEqual(stockBefore);
    expect((await context.prisma.productCategory.findUniqueOrThrow({ where: { id: graph.beverageCategory.id } })).name).toBe(graph.beverageCategory.name);
    expect((await context.prisma.warehouse.findUniqueOrThrow({ where: { id: graph.beverageWarehouse.id } })).name).toBe(graph.beverageWarehouse.name);
    expect((await context.prisma.order.findUniqueOrThrow({ where: { id: graph.beverageOrder.id } })).status).toBe("READY_FOR_DELIVERY");
    expect((await context.prisma.delivery.findUniqueOrThrow({ where: { id: graph.beverageDelivery.id } })).status).toBe("FAILED");

    const report = await fresh.get("/api/supplier/reports/sales.csv");
    expect(report.status).toBe(200);
    expect(report.text).not.toContain(graph.beverageOrder.id);
  });

  it("isolates store cart, orders, recurring orders, invoices, files, notifications, and reports", async () => {
    const graph = await createTenantGraph(context);
    const firstStore = await loginAgent(context, "store@alnoor.om");
    const [cart, orders, recurring, invoices, notifications] = await Promise.all([
      firstStore.get("/api/store/cart"),
      firstStore.get("/api/store/orders"),
      firstStore.get("/api/store/recurring-orders"),
      firstStore.get("/api/invoices"),
      firstStore.get("/api/notifications"),
    ]);
    const serialized = JSON.stringify({ cart: cart.body, orders: orders.body, recurring: recurring.body, invoices: invoices.body, notifications: notifications.body });
    expect(serialized).toContain(graph.firstStoreCartItem.id);
    expect(serialized).not.toContain(graph.secondStoreCartItem.id);
    expect(serialized).not.toContain(graph.beverageOrder.id);
    expect(serialized).not.toContain(graph.secondRecurring.id);
    expect(serialized).not.toContain(graph.beverageInvoice.id);
    expect(serialized).not.toContain(graph.secondNotification.id);

    const countsBefore = {
      cartItems: await context.prisma.cartItem.count(),
      attachments: await context.prisma.attachment.count(),
    };
    expect((await firstStore.delete(`/api/store/cart/items/${graph.secondStoreCartItem.id}`)).status).toBe(404);
    expect((await firstStore.patch(`/api/store/recurring-orders/${graph.secondRecurring.id}`).send({ name: "Stolen recurring" })).status).toBe(404);
    expect((await firstStore.post(`/api/store/recurring-orders/${graph.secondRecurring.id}/run`).send({ idempotencyKey: "foreign-recurring-run" })).status).toBe(404);
    expect((await firstStore.post("/api/store/recurring-orders").send({
      name: "Foreign address",
      deliveryAddressId: graph.secondStoreAddress.id,
      cadenceDays: 7,
      nextRunAt: new Date(Date.now() + 86_400_000),
      paymentMethod: "INVOICE",
      items: [{ productId: context.seed.products.freshMilk.id, quantity: 1 }],
    })).status).toBe(404);

    const foreignInvoice = await firstStore.get(`/api/invoices/${graph.beverageInvoice.id}/print`);
    const missingInvoice = await firstStore.get("/api/invoices/nonexistent-invoice/print");
    expect(foreignInvoice.status).toBe(403);
    expect(foreignInvoice.body).toEqual(missingInvoice.body);
    expect((await firstStore.get(`/api/files/${graph.secondAttachment.id}`)).status).toBe(403);
    expect((await firstStore.post(`/api/notifications/${graph.secondNotification.id}/read`)).status).toBe(403);
    expect((await firstStore.post("/api/files")
      .field("entityType", "order")
      .field("entityId", graph.beverageOrder.id)
      .attach("file", Buffer.from("fake"), { filename: "proof.png", contentType: "image/png" })).status).toBe(403);

    expect(await context.prisma.cartItem.count()).toBe(countsBefore.cartItems);
    expect(await context.prisma.attachment.count()).toBe(countsBefore.attachments);
    expect((await context.prisma.recurringOrder.findUniqueOrThrow({ where: { id: graph.secondRecurring.id } })).name).toBe("Second store recurring");
    expect((await context.prisma.notification.findUniqueOrThrow({ where: { id: graph.secondNotification.id } })).readAt).toBeNull();
    const report = await firstStore.get("/api/store/reports/spending.csv");
    expect(report.status).toBe(200);
    expect(report.text).not.toContain(graph.beverageOrder.id);
  });

  it("treats supplierId query as an intentional published marketplace filter", async () => {
    await createTenantGraph(context);
    const firstStore = await loginAgent(context, "store@alnoor.om");

    const response = await firstStore
      .get("/api/store/products")
      .query({ supplierId: context.seed.organizations.beverageSupplier.id });

    const expectedProductIds = await context.prisma.product.findMany({
      where: {
        supplierId: context.seed.organizations.beverageSupplier.id,
        status: "PUBLISHED",
      },
      select: { id: true },
    });

    expect(response.status).toBe(200);
    expect(
      response.body.products.map((product: { id: string }) => product.id).sort(),
    ).toEqual(expectedProductIds.map(({ id }) => id).sort());
    expect(response.body.products).toContainEqual(
      expect.objectContaining({ id: context.seed.products.beverageWater.id }),
    );
    expect(
      response.body.products.every(
        (product: { status: string }) => product.status === "PUBLISHED",
      ),
    ).toBe(true);
  });

  it("isolates driver reads and status writes and supplier driver assignment", async () => {
    const graph = await createTenantGraph(context);
    const freshDriver = await loginAgent(context, "driver@fresh.om");
    const freshSupplier = await loginAgent(context, "supplier@fresh.om");

    const list = await freshDriver.get("/api/driver/deliveries");
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(graph.beverageDelivery.id);
    expect((await freshDriver.post(`/api/driver/deliveries/${graph.beverageDelivery.id}/status`).send({ status: "ACCEPTED" })).status).toBe(404);
    expect((await freshSupplier.post(`/api/supplier/orders/${context.seed.seededOrder.id}/assign-driver`).send({ driverId: context.seed.users.beverageDriver.id })).status).toBe(400);
    expect((await context.prisma.delivery.findUniqueOrThrow({ where: { id: graph.beverageDelivery.id } })).status).toBe("FAILED");
    expect((await context.prisma.delivery.findUniqueOrThrow({ where: { orderId: context.seed.seededOrder.id } })).driverId).toBe(context.seed.users.freshDriver.id);
  });

  it("rejects cross-tenant inventory and payment idempotency collisions without leaking records", async () => {
    const graph = await createTenantGraph(context);
    const beverageSupplier = await loginAgent(context, "supplier@beverages.om");
    const secondStore = await loginAgent(context, graph.secondStoreUser.email);
    const foreignMovement = await context.prisma.inventoryMovement.findFirstOrThrow({
      where: { supplierId: context.seed.organizations.freshSupplier.id, idempotencyKey: { not: null } },
    });
    const paymentAttempt = await context.prisma.paymentAttempt.create({
      data: {
        orderId: context.seed.seededOrder.id,
        provider: "tenant-test",
        providerReference: "foreign-reference",
        idempotencyKey: "foreign-payment-key",
        status: "PROCESSING",
        amountBaisa: context.seed.seededOrder.totalBaisa,
        rawEventJson: "{}",
      },
    });
    const paymentCountBeforeCollision = await context.prisma.paymentAttempt.count();
    const stockBefore = await context.prisma.inventoryStock.findFirstOrThrow({
      where: { productId: context.seed.products.beverageWater.id },
    });

    const inventoryCollision = await beverageSupplier.post("/api/supplier/inventory/adjust").send({
      productId: context.seed.products.beverageWater.id,
      warehouseId: graph.beverageWarehouse.id,
      quantity: 1,
      type: "ADJUSTMENT_IN",
      idempotencyKey: foreignMovement.idempotencyKey,
    });
    const paymentCollision = await secondStore.post(`/api/store/orders/${context.seed.seededOrder.id}/payments`).send({
      provider: "tenant-test",
      idempotencyKey: paymentAttempt.idempotencyKey,
    });

    expect(inventoryCollision.status).toBe(409);
    expect(paymentCollision.status).toBe(409);
    expect(JSON.stringify(inventoryCollision.body)).not.toContain(foreignMovement.id);
    expect(JSON.stringify(paymentCollision.body)).not.toContain(paymentAttempt.id);
    expect(await context.prisma.inventoryStock.findUniqueOrThrow({ where: { id: stockBefore.id } })).toEqual(stockBefore);
    expect(await context.prisma.paymentAttempt.count()).toBe(paymentCountBeforeCollision);
  });

  it("allows super admin cross-tenant visibility only through declared admin/shared routes", async () => {
    const graph = await createTenantGraph(context);
    const admin = await loginAgent(context, "admin@salik.om");

    const invoices = await admin.get("/api/invoices");
    expect(invoices.status).toBe(200);
    expect(JSON.stringify(invoices.body)).toContain(graph.beverageInvoice.id);
    expect((await admin.get(`/api/invoices/${graph.beverageInvoice.id}/print`)).status).toBe(200);
    expect((await admin.get("/api/admin/organizations")).status).toBe(200);
    expect((await admin.get("/api/supplier/products")).status).toBe(403);
    expect((await admin.get("/api/store/orders")).status).toBe(403);
    expect((await admin.get("/api/driver/deliveries")).status).toBe(403);
  });
});
