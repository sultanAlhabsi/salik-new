import bcrypt from "bcryptjs";
import type { Prisma, PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";
import { calculateLineTotal } from "../../src/server/domain/money";

const testPassword = "Password123!";

type AddressFactoryInput = Partial<Prisma.AddressUncheckedCreateInput> & {
  organizationId: string;
};
type WarehouseFactoryInput = Partial<Prisma.WarehouseUncheckedCreateInput> & {
  supplierId: string;
};
type ProductFactoryInput = Partial<Prisma.ProductUncheckedCreateInput> & {
  supplierId: string;
};
type StockFactoryInput = Partial<Prisma.InventoryStockUncheckedCreateInput> & {
  supplierId: string;
  productId: string;
  warehouseId: string;
};

export type OrderFactoryInput = {
  supplierId: string;
  storeId: string;
  createdById: string;
  deliveryAddressId: string;
  productId: string;
  quantity?: number;
  paymentMethod?: "CARD" | "INVOICE";
  status?: Prisma.OrderUncheckedCreateInput["status"];
  paymentStatus?: Prisma.OrderUncheckedCreateInput["paymentStatus"];
};

export function createTestFactories(prisma: PrismaClient) {
  const runId = nanoid(8);
  let sequence = 0;
  const unique = (prefix: string) => `${prefix}-${runId}-${++sequence}`;

  const organization = (
    input: Partial<Prisma.OrganizationUncheckedCreateInput> = {},
  ) =>
    prisma.organization.create({
      data: {
        name: unique("Test organization"),
        type: "SUPPLIER",
        email: `${unique("organization")}@example.test`,
        ...input,
      },
    });

  const user = async (input: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
    prisma.user.create({
      data: {
        email: `${unique("user")}@example.test`,
        name: unique("Test user"),
        passwordHash: await bcrypt.hash(testPassword, 4),
        role: "SUPPLIER_ADMIN",
        organizationId: null,
        ...input,
      },
    });

  const address = (input: AddressFactoryInput) =>
    prisma.address.create({
      data: {
        type: "SHIPPING",
        label: unique("Test address"),
        line1: "Test Street",
        city: "Muscat",
        ...input,
      },
    });

  const warehouse = (input: WarehouseFactoryInput) =>
    prisma.warehouse.create({
      data: {
        name: unique("Test warehouse"),
        ...input,
      },
    });

  const product = (input: ProductFactoryInput) =>
    prisma.product.create({
      data: {
        sku: unique("SKU"),
        name: unique("Test product"),
        description: "Product created by the integration test factory.",
        unit: "case",
        priceBaisa: 1_000,
        taxRateBps: 500,
        minOrderQty: 1,
        status: "PUBLISHED",
        ...input,
      },
    });

  const inventoryStock = (input: StockFactoryInput) =>
    prisma.inventoryStock.create({
      data: {
        onHand: 100,
        reserved: 0,
        lowStockThreshold: 10,
        ...input,
      },
    });

  const order = async (input: OrderFactoryInput) => {
    const productRecord = await prisma.product.findUniqueOrThrow({
      where: { id: input.productId },
    });
    const quantity = input.quantity ?? 1;
    const totals = calculateLineTotal({
      unitPriceBaisa: productRecord.priceBaisa,
      quantity,
      taxRateBps: productRecord.taxRateBps,
    });

    return prisma.order.create({
      data: {
        supplierId: input.supplierId,
        storeId: input.storeId,
        createdById: input.createdById,
        deliveryAddressId: input.deliveryAddressId,
        status: input.status ?? "SUBMITTED",
        paymentStatus: input.paymentStatus ?? "PENDING",
        paymentMethod: input.paymentMethod ?? "INVOICE",
        subtotalBaisa: totals.subtotalBaisa,
        taxBaisa: totals.taxBaisa,
        totalBaisa: totals.totalBaisa,
        idempotencyKey: unique("order"),
        items: {
          create: {
            productId: productRecord.id,
            skuSnapshot: productRecord.sku,
            nameSnapshot: productRecord.name,
            unit: productRecord.unit,
            quantity,
            unitPriceBaisa: productRecord.priceBaisa,
            taxRateBps: productRecord.taxRateBps,
            lineTotalBaisa: totals.totalBaisa,
          },
        },
      },
      include: { items: true },
    });
  };

  const commerceScenario = async () => {
    const supplier = await organization({
      type: "SUPPLIER",
      name: unique("Supplier"),
    });
    const store = await organization({ type: "STORE", name: unique("Store") });
    const [supplierUser, storeUser, driver] = await Promise.all([
      user({ organizationId: supplier.id, role: "SUPPLIER_ADMIN" }),
      user({ organizationId: store.id, role: "STORE_ADMIN" }),
      user({ organizationId: supplier.id, role: "DRIVER" }),
    ]);
    const deliveryAddress = await address({
      organizationId: store.id,
      type: "SHIPPING",
      isDefault: true,
    });
    const warehouseAddress = await address({
      organizationId: supplier.id,
      type: "WAREHOUSE",
      isDefault: true,
    });
    const warehouseRecord = await warehouse({
      supplierId: supplier.id,
      addressId: warehouseAddress.id,
    });
    const productRecord = await product({ supplierId: supplier.id });
    const stock = await inventoryStock({
      supplierId: supplier.id,
      productId: productRecord.id,
      warehouseId: warehouseRecord.id,
    });

    return {
      password: testPassword,
      supplier,
      store,
      supplierUser,
      storeUser,
      driver,
      deliveryAddress,
      warehouseAddress,
      warehouse: warehouseRecord,
      product: productRecord,
      stock,
    };
  };

  return {
    organization,
    user,
    address,
    warehouse,
    product,
    inventoryStock,
    order,
    commerceScenario,
  };
}

export type TestFactories = ReturnType<typeof createTestFactories>;
