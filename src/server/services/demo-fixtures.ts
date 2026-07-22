import { calculateLineTotal } from "../domain/money.js";

export const demoPassword = "Password123!";

type OrganizationType = "PLATFORM" | "SUPPLIER" | "STORE";
type UserRole =
  | "SUPER_ADMIN"
  | "SUPPLIER_ADMIN"
  | "SUPPLIER_STAFF"
  | "STORE_ADMIN"
  | "STORE_BUYER"
  | "DRIVER";
type ProductStatus = "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
type OrderStatus =
  | "SUBMITTED"
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_DELIVERY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "REJECTED"
  | "CANCELLED";

const id = (kind: string, slug: string) => `hosted-demo-${kind}-${slug}`;
const at = (day: number, hour = 8) => new Date(Date.UTC(2026, 5, day, hour));

const supplierSeeds = [
  [
    "muscat-fresh",
    "Muscat Fresh Distribution",
    "sales@fresh.om",
    "+96824410000",
    "OM-VAT-DEMO-1001",
  ],
  [
    "nizwa-beverages",
    "Nizwa Beverages",
    "orders@nizwabev.om",
    "+96825440000",
    "OM-VAT-DEMO-2002",
  ],
  [
    "sohar-household",
    "Sohar Household Supply",
    "trade@soharhouse.om",
    "+96826840000",
    "OM-VAT-DEMO-3003",
  ],
  [
    "dhofar-foods",
    "Dhofar Foods & Cold Chain",
    "sales@dhofarfoods.om",
    "+96823210000",
    "OM-VAT-DEMO-4004",
  ],
] as const;

const storeSeeds = [
  [
    "al-noor",
    "Al Noor Market",
    "procurement@alnoor.om",
    "+96824550000",
    "Muscat",
    "Muttrah Souq Street",
  ],
  [
    "muttrah-family",
    "Muttrah Family Mart",
    "buying@muttrahmart.om",
    "+96824710000",
    "Muttrah",
    "Corniche Road",
  ],
  [
    "nizwa-gate",
    "Nizwa Gate Market",
    "orders@nizwagate.om",
    "+96825220000",
    "Nizwa",
    "Farq Commercial Area",
  ],
  [
    "sohar-coast",
    "Sohar Coast Hypermarket",
    "supply@soharcoast.om",
    "+96826770000",
    "Sohar",
    "Al Hambar Street",
  ],
  [
    "salalah-oasis",
    "Salalah Oasis Store",
    "purchasing@salalahoasis.om",
    "+96823290000",
    "Salalah",
    "Awqad Main Road",
  ],
  [
    "sur-harbour",
    "Sur Harbour Grocery",
    "stock@surharbour.om",
    "+96825540000",
    "Sur",
    "Al Ayjah Road",
  ],
] as const;

const supplierIds = supplierSeeds.map(([slug], index) =>
  index === 0 ? "hosted-demo-supplier" : id("supplier", slug),
);
const storeIds = storeSeeds.map(([slug], index) =>
  index === 0 ? "hosted-demo-store" : id("store", slug),
);

export const demoFixtureIds = {
  platform: id("platform", "salik"),
  supplier: supplierIds[0],
  store: storeIds[0],
  adminUser: "hosted-demo-user-admin",
  supplierUser: "hosted-demo-user-supplier",
  storeUser: "hosted-demo-user-store",
  driverUser: "hosted-demo-user-driver",
  storeShippingAddress: "hosted-demo-address-store-shipping",
  storeBillingAddress: "hosted-demo-address-store-billing",
  warehouseAddress: "hosted-demo-address-warehouse",
  warehouse: "hosted-demo-warehouse",
  plan: id("plan", "growth"),
  subscription: id("subscription", "muscat-fresh"),
  category: "hosted-demo-category-dairy",
  milkProduct: "hosted-demo-product-milk",
  labanProduct: "hosted-demo-product-laban",
  milkStock: "hosted-demo-stock-milk",
  labanStock: "hosted-demo-stock-laban",
  cart: "hosted-demo-cart",
  cartItem: "hosted-demo-cart-item",
  order: "hosted-demo-order",
  orderItem: "hosted-demo-order-item",
  orderEvent: "hosted-demo-order-event",
  movement: "hosted-demo-inventory-movement",
  invoice: "hosted-demo-invoice",
  delivery: "hosted-demo-delivery",
  deliveryEvent: "hosted-demo-delivery-event",
} as const;

export type PreparedDemoAccount = {
  id: string;
  email: string;
  name: string;
  role: Extract<
    UserRole,
    "SUPER_ADMIN" | "SUPPLIER_ADMIN" | "STORE_ADMIN" | "DRIVER"
  >;
  organizationId: string | null;
};

export const preparedDemoAccounts = [
  {
    id: demoFixtureIds.supplierUser,
    email: "supplier@fresh.om",
    name: "Salim Fresh Admin",
    role: "SUPPLIER_ADMIN",
    organizationId: supplierIds[0],
  },
  {
    id: demoFixtureIds.storeUser,
    email: "store@alnoor.om",
    name: "Maha Store Buyer",
    role: "STORE_ADMIN",
    organizationId: storeIds[0],
  },
  {
    id: demoFixtureIds.driverUser,
    email: "driver@fresh.om",
    name: "Yusuf Delivery Driver",
    role: "DRIVER",
    organizationId: supplierIds[0],
  },
  {
    id: demoFixtureIds.adminUser,
    email: "demo-admin@salik.om",
    name: "SALIK Demo Admin",
    role: "SUPER_ADMIN",
    organizationId: null,
  },
] as const satisfies readonly PreparedDemoAccount[];

const platform = {
  id: demoFixtureIds.platform,
  name: "SALIK Operations",
  type: "PLATFORM" as OrganizationType,
  email: "ops@salik.om",
  phone: "+96824000000",
  taxNumber: null,
};

const suppliers = supplierSeeds.map(
  ([_slug, name, email, phone, taxNumber], index) => ({
    id: supplierIds[index],
    name,
    type: "SUPPLIER" as OrganizationType,
    email,
    phone,
    taxNumber,
  }),
);

const stores = storeSeeds.map(([slug, name, email, phone], index) => ({
  id: storeIds[index],
  name,
  type: "STORE" as OrganizationType,
  email,
  phone,
  taxNumber: `OM-VAT-STORE-${slug.toUpperCase()}`,
}));

const storeAddresses = storeSeeds.flatMap(
  ([slug, name, , phone, city, line1], index) => {
    const shipping = {
      id:
        index === 0
          ? demoFixtureIds.storeShippingAddress
          : id("address", `store-${slug}-shipping`),
      organizationId: storeIds[index],
      type: "SHIPPING" as const,
      label: `${name} Delivery`,
      line1,
      line2: null,
      city,
      country: "Oman",
      phone,
      isDefault: true,
    };
    return index === 0
      ? [
          shipping,
          {
            ...shipping,
            id: demoFixtureIds.storeBillingAddress,
            type: "BILLING" as const,
            label: "Al Noor Finance",
            line1: "Muttrah Corniche Road",
            isDefault: true,
          },
        ]
      : [shipping];
  },
);

const warehouseSeeds = [
  [
    "muscat-cold",
    0,
    "Muscat Cold Warehouse",
    "Ghala Industrial Area",
    "Muscat",
  ],
  ["barka-fresh", 0, "Barka Fresh Hub", "Barka Logistics Park", "Barka"],
  ["nizwa-main", 1, "Nizwa Main Warehouse", "Nizwa Industrial Estate", "Nizwa"],
  ["sohar-main", 2, "Sohar Household Depot", "Sohar Industrial Port", "Sohar"],
  ["salalah-cold", 3, "Salalah Cold Chain", "Raysut Free Zone", "Salalah"],
] as const;

const warehouseAddresses = warehouseSeeds.map(
  ([slug, supplierIndex, name, line1, city]) => ({
    id:
      slug === "muscat-cold"
        ? demoFixtureIds.warehouseAddress
        : id("address", `warehouse-${slug}`),
    organizationId: supplierIds[supplierIndex],
    type: "WAREHOUSE" as const,
    label: name,
    line1,
    line2: null,
    city,
    country: "Oman",
    phone: supplierSeeds[supplierIndex][3],
    isDefault: slug !== "barka-fresh",
  }),
);

const warehouses = warehouseSeeds.map(([slug, supplierIndex, name]) => ({
  id: slug === "muscat-cold" ? demoFixtureIds.warehouse : id("warehouse", slug),
  supplierId: supplierIds[supplierIndex],
  addressId:
    slug === "muscat-cold"
      ? demoFixtureIds.warehouseAddress
      : id("address", `warehouse-${slug}`),
  name,
  status: "ACTIVE" as const,
}));

const backgroundUsers = [
  [
    "supplier-nizwa",
    "supplier@beverages.om",
    "Huda Al Hinai",
    "SUPPLIER_ADMIN",
    supplierIds[1],
  ],
  [
    "supplier-sohar",
    "supplier@soharhouse.om",
    "Ahmed Al Balushi",
    "SUPPLIER_ADMIN",
    supplierIds[2],
  ],
  [
    "supplier-dhofar",
    "supplier@dhofarfoods.om",
    "Maryam Al Kathiri",
    "SUPPLIER_ADMIN",
    supplierIds[3],
  ],
  [
    "staff-fresh",
    "staff@fresh.demo",
    "Fatma Al Rashdi",
    "SUPPLIER_STAFF",
    supplierIds[0],
  ],
  [
    "store-muttrah",
    "buyer@muttrah.demo",
    "Ali Al Lawati",
    "STORE_ADMIN",
    storeIds[1],
  ],
  [
    "store-nizwa",
    "buyer@nizwa.demo",
    "Sara Al Kindi",
    "STORE_ADMIN",
    storeIds[2],
  ],
  [
    "store-sohar",
    "buyer@sohar.demo",
    "Khalid Al Maawali",
    "STORE_ADMIN",
    storeIds[3],
  ],
  [
    "store-salalah",
    "buyer@salalah.demo",
    "Noor Al Shanfari",
    "STORE_ADMIN",
    storeIds[4],
  ],
  ["store-sur", "buyer@sur.demo", "Salma Al Farsi", "STORE_ADMIN", storeIds[5]],
  [
    "driver-nizwa-1",
    "driver1@nizwa.demo",
    "Nasser Al Wardi",
    "DRIVER",
    supplierIds[1],
  ],
  [
    "driver-nizwa-2",
    "driver2@nizwa.demo",
    "Said Al Rawahi",
    "DRIVER",
    supplierIds[1],
  ],
  [
    "driver-sohar",
    "driver@sohar.demo",
    "Hamood Al Jabri",
    "DRIVER",
    supplierIds[2],
  ],
  [
    "driver-dhofar-1",
    "driver1@dhofar.demo",
    "Salim Al Mashani",
    "DRIVER",
    supplierIds[3],
  ],
  [
    "driver-dhofar-2",
    "driver2@dhofar.demo",
    "Hassan Al Mahri",
    "DRIVER",
    supplierIds[3],
  ],
] as const;

const users = [
  ...preparedDemoAccounts,
  ...backgroundUsers.map(([slug, email, name, role, organizationId]) => ({
    id: id("user", slug),
    email,
    name,
    role: role as UserRole,
    organizationId,
  })),
];

const driverIds = [
  demoFixtureIds.driverUser,
  id("user", "driver-nizwa-1"),
  id("user", "driver-nizwa-2"),
  id("user", "driver-sohar"),
  id("user", "driver-dhofar-1"),
  id("user", "driver-dhofar-2"),
];

const categories = supplierSeeds.flatMap(([supplierSlug], supplierIndex) => {
  const categoryNames = [
    ["Dairy & Produce", "Bakery & Chilled"],
    ["Beverages", "Pantry"],
    ["Household", "Cleaning"],
    ["Frozen Foods", "Dhofari Pantry"],
  ][supplierIndex];
  return categoryNames.map((name, categoryIndex) => ({
    id:
      supplierIndex === 0 && categoryIndex === 0
        ? demoFixtureIds.category
        : id("category", `${supplierSlug}-${categoryIndex + 1}`),
    supplierId: supplierIds[supplierIndex],
    name,
    status: "PUBLISHED" as ProductStatus,
  }));
});

const productCatalog = [
  [
    ["FR-MILK-1L", "Fresh Milk 1L", "carton", 650],
    ["FR-LABAN-500", "Laban 500ml Case", "case", 4200],
    ["FR-YOG-12", "Natural Yoghurt 12 Pack", "case", 3600],
    ["FR-EGGS-30", "Omani Eggs Tray 30", "tray", 2900],
    ["FR-TOM-5", "Omani Tomatoes 5kg", "crate", 3800],
    ["FR-CUC-5", "Cucumbers 5kg", "crate", 3100],
    ["FR-BREAD-20", "Arabic Bread Bundle", "bundle", 2400],
    ["FR-CHEESE-2", "White Cheese 2kg", "tin", 5400],
    ["FR-BUTTER-20", "Butter Portions 20 Pack", "case", 4600],
    ["FR-JUICE-12", "Fresh Orange Juice 12 Pack", "case", 6200],
  ],
  [
    ["NZ-WATER-12", "Spring Water 12 Pack", "case", 1800],
    ["NZ-WATER-24", "Mineral Water 24 Pack", "case", 2600],
    ["NZ-COLA-24", "Cola 24 Pack", "case", 7200],
    ["NZ-LEMON-24", "Lemon Soda 24 Pack", "case", 6900],
    ["NZ-MANGO-12", "Mango Drink 12 Pack", "case", 4800],
    ["NZ-DATES-5", "Nizwa Dates 5kg", "box", 8500],
    ["NZ-COFFEE-1", "Omani Coffee 1kg", "bag", 7800],
    ["NZ-SUGAR-10", "White Sugar 10kg", "bag", 5200],
    ["NZ-RICE-20", "Basmati Rice 20kg", "bag", 14200],
    ["NZ-FLOUR-10", "Baker Flour 10kg", "bag", 4100],
  ],
  [
    ["SH-TISSUE-24", "Facial Tissue 24 Pack", "case", 8800],
    ["SH-ROLL-48", "Kitchen Roll 48 Pack", "case", 11200],
    ["SH-BAGS-100", "Waste Bags 100 Pack", "box", 4700],
    ["SH-FOIL-12", "Aluminium Foil 12 Roll", "case", 6900],
    ["SH-CUPS-500", "Paper Cups 500", "carton", 7600],
    ["SH-DISH-4", "Dishwashing Liquid 4L", "bottle", 3200],
    ["SH-FLOOR-5", "Floor Cleaner 5L", "bottle", 3900],
    ["SH-BLEACH-6", "Bleach 6 Pack", "case", 4100],
    ["SH-SOAP-24", "Hand Soap 24 Pack", "case", 9800],
    ["SH-DETERGENT-10", "Laundry Detergent 10kg", "bag", 12800],
  ],
  [
    ["DH-CHICKEN-10", "Frozen Chicken 10kg", "carton", 16800],
    ["DH-FISH-8", "Frozen Kingfish 8kg", "carton", 22400],
    ["DH-BEEF-10", "Frozen Beef 10kg", "carton", 31500],
    ["DH-VEG-12", "Mixed Vegetables 12 Pack", "case", 9600],
    ["DH-FRIES-10", "French Fries 10kg", "carton", 11800],
    ["DH-BANANA-13", "Salalah Bananas 13kg", "crate", 7400],
    ["DH-COCONUT-20", "Fresh Coconut 20 Pack", "sack", 8900],
    ["DH-HONEY-6", "Dhofari Honey 6 Jar", "case", 27600],
    ["DH-SPICE-12", "Omani Spice Mix 12 Pack", "case", 8600],
    ["DH-HALWA-6", "Omani Halwa 6 Pack", "case", 13200],
  ],
] as const;

const productStatuses: ProductStatus[] = [
  ...Array<ProductStatus>(32).fill("PUBLISHED"),
  ...Array<ProductStatus>(4).fill("DRAFT"),
  ...Array<ProductStatus>(2).fill("HIDDEN"),
  ...Array<ProductStatus>(2).fill("ARCHIVED"),
];

const imageUrls = [
  "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=900&q=80",
];

const products = productCatalog.flatMap((supplierProducts, supplierIndex) =>
  supplierProducts.map(([sku, name, unit, priceBaisa], productIndex) => {
    const globalIndex = supplierIndex * 10 + productIndex;
    const status = productStatuses[globalIndex];
    return {
      id:
        supplierIndex === 0 && productIndex === 0
          ? demoFixtureIds.milkProduct
          : supplierIndex === 0 && productIndex === 1
            ? demoFixtureIds.labanProduct
            : id(
                "product",
                `${supplierSeeds[supplierIndex][0]}-${String(productIndex + 1).padStart(2, "0")}`,
              ),
      supplierId: supplierIds[supplierIndex],
      categoryId: categories[supplierIndex * 2 + (productIndex < 5 ? 0 : 1)].id,
      sku: `DEMO-${sku}`,
      name,
      description: `${name} supplied in wholesale-ready packaging for Omani groceries, cafés, and hospitality customers.`,
      imageUrl: imageUrls[supplierIndex],
      unit,
      priceBaisa,
      taxRateBps: productIndex % 4 === 0 ? 0 : 500,
      minOrderQty: (productIndex % 3) + 1,
      status,
      archivedAt: status === "ARCHIVED" ? at(1) : null,
    };
  }),
);

const primaryWarehouseBySupplier = [
  warehouses[0],
  warehouses[2],
  warehouses[3],
  warehouses[4],
];
const stocks = products.map((product, index) => {
  const inventoryLevel =
    index % 10 === 8 ? 0 : index % 7 === 5 ? 6 : 70 + index * 3;
  return {
    id:
      index === 0
        ? demoFixtureIds.milkStock
        : index === 1
          ? demoFixtureIds.labanStock
          : id("stock", product.id.replace("hosted-demo-product-", "")),
    supplierId: product.supplierId,
    productId: product.id,
    warehouseId: primaryWarehouseBySupplier[Math.floor(index / 10)].id,
    onHand: inventoryLevel,
    reserved: inventoryLevel > 10 && index % 4 === 0 ? 4 : 0,
    lowStockThreshold: 12,
  };
});

const storeUserIds = [
  demoFixtureIds.storeUser,
  id("user", "store-muttrah"),
  id("user", "store-nizwa"),
  id("user", "store-sohar"),
  id("user", "store-salalah"),
  id("user", "store-sur"),
];
const supplierAdminIds = [
  demoFixtureIds.supplierUser,
  id("user", "supplier-nizwa"),
  id("user", "supplier-sohar"),
  id("user", "supplier-dhofar"),
];

const orderStatuses: OrderStatus[] = [
  "READY_FOR_DELIVERY",
  "SUBMITTED",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "REJECTED",
  "CANCELLED",
  "DELIVERED",
  "READY_FOR_DELIVERY",
  "PREPARING",
  "ACCEPTED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "SUBMITTED",
  "DELIVERED",
  "CANCELLED",
  "READY_FOR_DELIVERY",
  "PREPARING",
  "DELIVERED",
];
const orderPairs = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 2],
  [2, 3],
  [2, 4],
  [2, 5],
  [3, 1],
  [3, 3],
  [3, 4],
  [3, 5],
] as const;

const orders = orderPairs.map(([supplierIndex, storeIndex], orderIndex) => {
  const orderProducts = products.slice(
    supplierIndex * 10,
    supplierIndex * 10 + 3,
  );
  const itemCount = (orderIndex % 3) + 1;
  const items = orderProducts.slice(0, itemCount).map((product, itemIndex) => {
    const quantity = Math.max(
      product.minOrderQty,
      itemIndex + 1 + (orderIndex % 2),
    );
    const line = calculateLineTotal({
      unitPriceBaisa: product.priceBaisa,
      quantity,
      taxRateBps: product.taxRateBps,
    });
    return {
      id:
        orderIndex === 0 && itemIndex === 0
          ? demoFixtureIds.orderItem
          : id(
              "order-item",
              `${String(orderIndex + 1).padStart(2, "0")}-${itemIndex + 1}`,
            ),
      productId: product.id,
      skuSnapshot: product.sku,
      nameSnapshot: product.name,
      unit: product.unit,
      quantity,
      unitPriceBaisa: product.priceBaisa,
      taxRateBps: product.taxRateBps,
      lineSubtotalBaisa: line.subtotalBaisa,
      lineTaxBaisa: line.taxBaisa,
      lineTotalBaisa: line.totalBaisa,
    };
  });
  const subtotalBaisa = items.reduce(
    (sum, item) => sum + item.lineSubtotalBaisa,
    0,
  );
  const taxBaisa = items.reduce((sum, item) => sum + item.lineTaxBaisa, 0);
  const shippingBaisa = orderIndex % 5 === 0 ? 500 : 0;
  const discountBaisa = orderIndex % 6 === 0 ? 250 : 0;
  return {
    id:
      orderIndex === 0
        ? demoFixtureIds.order
        : id("order", String(orderIndex + 1).padStart(2, "0")),
    supplierId: supplierIds[supplierIndex],
    storeId: storeIds[storeIndex],
    createdById: storeUserIds[storeIndex],
    deliveryAddressId:
      storeIndex === 0
        ? demoFixtureIds.storeShippingAddress
        : id("address", `store-${storeSeeds[storeIndex][0]}-shipping`),
    status: orderStatuses[orderIndex],
    paymentStatus:
      orderStatuses[orderIndex] === "DELIVERED"
        ? ("PAID" as const)
        : ("PENDING" as const),
    paymentMethod:
      orderIndex % 3 === 0 ? ("CARD" as const) : ("INVOICE" as const),
    note: `Demo wholesale order ${String(orderIndex + 1).padStart(2, "0")}`,
    currency: "OMR",
    subtotalBaisa,
    taxBaisa,
    shippingBaisa,
    discountBaisa,
    totalBaisa: subtotalBaisa + taxBaisa + shippingBaisa - discountBaisa,
    idempotencyKey: id("order-key", String(orderIndex + 1).padStart(2, "0")),
    createdAt: at(2 + orderIndex, 7 + (orderIndex % 5)),
    items,
  };
});

const orderEvents = orders.map((order, index) => ({
  id:
    index === 0
      ? demoFixtureIds.orderEvent
      : id("order-event", String(index + 1).padStart(2, "0")),
  orderId: order.id,
  actorId: supplierAdminIds[supplierIds.indexOf(order.supplierId)],
  type: "STATUS_CHANGED",
  previousValueJson: null,
  newValueJson: JSON.stringify({ status: order.status }),
  message: `Demo order moved to ${order.status.toLowerCase().replaceAll("_", " ")}`,
  createdAt: at(2 + index, 12),
}));

const movementOrders = orders.filter(
  ({ status }) => !["REJECTED", "CANCELLED"].includes(status),
);
const movements = movementOrders.map((order, index) => {
  const item = order.items[0];
  const stock = stocks.find(({ productId }) => productId === item.productId)!;
  const delivered = order.status === "DELIVERED";
  return {
    id:
      index === 0
        ? demoFixtureIds.movement
        : id("movement", String(index + 1).padStart(2, "0")),
    supplierId: order.supplierId,
    productId: item.productId,
    warehouseId: stock.warehouseId,
    orderId: order.id,
    actorId: order.createdById,
    type: delivered ? ("DEDUCTION" as const) : ("RESERVATION" as const),
    quantity: item.quantity,
    beforeOnHand: stock.onHand,
    afterOnHand: delivered
      ? Math.max(0, stock.onHand - item.quantity)
      : stock.onHand,
    beforeReserved: 0,
    afterReserved: delivered ? 0 : item.quantity,
    idempotencyKey: id("movement-key", String(index + 1).padStart(2, "0")),
    createdAt: at(3 + index, 9),
  };
});

const invoiceOrders = orders.filter(({ status }) =>
  [
    "ACCEPTED",
    "PREPARING",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ].includes(status),
);
const invoices = invoiceOrders.map((order, index) => ({
  id:
    index === 0
      ? demoFixtureIds.invoice
      : id("invoice", String(index + 1).padStart(2, "0")),
  orderId: order.id,
  supplierId: order.supplierId,
  storeId: order.storeId,
  invoiceNumber: `INV-DEMO-2026-${String(index + 1).padStart(4, "0")}`,
  status:
    order.status === "DELIVERED" ? ("PAID" as const) : ("ISSUED" as const),
  currency: "OMR",
  subtotalBaisa: order.subtotalBaisa,
  taxBaisa: order.taxBaisa,
  totalBaisa: order.totalBaisa,
  issueDate: order.createdAt,
  dueDate: at(28, 17),
}));

const paymentAttempts = invoices.map((invoice, index) => ({
  id: id("payment", String(index + 1).padStart(2, "0")),
  orderId: invoice.orderId,
  invoiceId: invoice.id,
  provider: index % 2 === 0 ? "demo-card" : "demo-invoice",
  providerReference: `SALIK-DEMO-PAY-${String(index + 1).padStart(4, "0")}`,
  idempotencyKey: id("payment-key", String(index + 1).padStart(2, "0")),
  status: invoice.status === "PAID" ? ("PAID" as const) : ("PENDING" as const),
  amountBaisa: invoice.totalBaisa,
  rawEventJson: JSON.stringify({
    source: "demo-fixture",
    settled: invoice.status === "PAID",
  }),
  createdAt: invoice.issueDate,
}));

const deliveryOrders = orders.filter(({ status }) =>
  ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status),
);
const deliveries = deliveryOrders.map((order, index) => {
  const supplierIndex = supplierIds.indexOf(order.supplierId);
  const eligibleDrivers = driverIds.filter((driverId) => {
    const driver = users.find(({ id: userId }) => userId === driverId)!;
    return driver.organizationId === order.supplierId;
  });
  const driverId =
    supplierIndex === 0
      ? demoFixtureIds.driverUser
      : eligibleDrivers[index % eligibleDrivers.length];
  const status =
    order.status === "DELIVERED"
      ? ("DELIVERED" as const)
      : order.status === "OUT_FOR_DELIVERY"
        ? ("OUT_FOR_DELIVERY" as const)
        : index % 2 === 0
          ? ("ASSIGNED" as const)
          : ("ACCEPTED" as const);
  return {
    id:
      index === 0
        ? demoFixtureIds.delivery
        : id("delivery", String(index + 1).padStart(2, "0")),
    supplierId: order.supplierId,
    storeId: order.storeId,
    orderId: order.id,
    driverId,
    status,
    recipientName: status === "DELIVERED" ? "Store Receiving Team" : null,
    proofNote:
      status === "DELIVERED"
        ? "Goods checked and received in good condition."
        : null,
    failureReason: null,
    scheduledFor: at(4 + index, 10),
    deliveredAt: status === "DELIVERED" ? at(4 + index, 15) : null,
  };
});

const deliveryEvents = deliveries.map((delivery, index) => ({
  id:
    index === 0
      ? demoFixtureIds.deliveryEvent
      : id("delivery-event", String(index + 1).padStart(2, "0")),
  deliveryId: delivery.id,
  actorId: delivery.driverId,
  previousStatus: null,
  newStatus: delivery.status,
  message: `Demo delivery is ${delivery.status.toLowerCase().replaceAll("_", " ")}`,
  createdAt: at(4 + index, 11),
}));

const cartStoreIndexes = [0, 1, 2, 3] as const;
const carts = cartStoreIndexes.map((storeIndex, index) => ({
  id: index === 0 ? demoFixtureIds.cart : id("cart", storeSeeds[storeIndex][0]),
  storeId: storeIds[storeIndex],
  userId: storeUserIds[storeIndex],
  status: "ACTIVE" as const,
  checkoutRef: null,
}));
const cartItems = carts.slice(1).flatMap((cart, cartIndex) =>
  [0, 1].map((offset) => {
    const product = products[cartIndex * 10 + offset];
    const storeIndex = cartStoreIndexes[cartIndex + 1];
    return {
      id:
        cartIndex === 0 && offset === 0
          ? demoFixtureIds.cartItem
          : id("cart-item", `${storeSeeds[storeIndex][0]}-${offset + 1}`),
      cartId: cart.id,
      productId: product.id,
      supplierId: product.supplierId,
      userId: cart.userId,
      quantity: Math.max(product.minOrderQty, 2),
    };
  }),
);

const recurringOrders = [0, 1, 2].map((index) => ({
  id: id("recurring", String(index + 1).padStart(2, "0")),
  storeId: storeIds[index],
  supplierId: supplierIds[index],
  userId: storeUserIds[index],
  deliveryAddressId:
    index === 0
      ? demoFixtureIds.storeShippingAddress
      : id("address", `store-${storeSeeds[index][0]}-shipping`),
  name: [
    "Weekly fresh essentials",
    "Fortnightly beverages",
    "Monthly household stock",
  ][index],
  status: index === 2 ? ("PAUSED" as const) : ("ACTIVE" as const),
  cadenceDays: [7, 14, 30][index],
  nextRunAt: at(27 + index),
  paymentMethod: index === 0 ? ("CARD" as const) : ("INVOICE" as const),
  note: "Deterministic recurring demo order",
  lastRunAt: at(13 + index),
  items: [
    {
      id: id("recurring-item", String(index + 1).padStart(2, "0")),
      productId: products[index * 10].id,
      quantity: Math.max(products[index * 10].minOrderQty, 2),
    },
  ],
}));

const plan = {
  id: demoFixtureIds.plan,
  code: "hosted-demo-growth",
  name: "Demo Growth",
  status: "ACTIVE" as const,
  monthlyPriceBaisa: 49000,
  maxUsers: 20,
  maxWarehouses: 5,
  maxProducts: 500,
  supportsCredit: true,
};
const subscriptions = supplierIds.map((supplierId, index) => ({
  id: id("subscription", supplierSeeds[index][0]),
  supplierId,
  planId: plan.id,
  status: ["ACTIVE", "TRIAL", "PAST_DUE", "ACTIVE"][index] as
    "ACTIVE" | "TRIAL" | "PAST_DUE",
  currentPeriodStart: at(1),
  currentPeriodEnd: at(30, 23),
}));

const notifications = [
  [
    "admin",
    null,
    demoFixtureIds.adminUser,
    "platform",
    demoFixtureIds.platform,
    "Demo network ready",
  ],
  [
    "supplier",
    supplierIds[0],
    demoFixtureIds.supplierUser,
    "order",
    orders[0].id,
    "Order ready for delivery",
  ],
  [
    "store",
    storeIds[0],
    demoFixtureIds.storeUser,
    "order",
    orders[5].id,
    "Order delivered",
  ],
  [
    "driver",
    supplierIds[0],
    demoFixtureIds.driverUser,
    "delivery",
    deliveries[0].id,
    "New route assigned",
  ],
].map(([slug, organizationId, userId, entityType, entityId, title], index) => ({
  id: id("notification", String(slug)),
  organizationId,
  userId,
  entityType: String(entityType),
  entityId: String(entityId),
  title: String(title),
  body: `${String(title)} in the SALIK prepared demo network.`,
  readAt: index % 2 === 0 ? at(20, 16) : null,
  createdAt: at(20 + index, 9),
}));

const supportTickets = [
  [storeIds[0], demoFixtureIds.storeUser, "OPEN", "Invoice copy needed"],
  [supplierIds[1], supplierAdminIds[1], "IN_PROGRESS", "Update delivery zone"],
  [storeIds[4], storeUserIds[4], "DONE", "Product catalogue question"],
].map(([organizationId, createdById, status, subject], index) => ({
  id: id("ticket", String(index + 1).padStart(2, "0")),
  organizationId,
  createdById,
  status: status as "OPEN" | "IN_PROGRESS" | "DONE",
  subject,
  message: `${subject} for the prepared wholesale demonstration.`,
  internalNotes:
    index === 1 ? "Operations team reviewing the requested zone." : null,
}));

const auditLogs = [
  {
    id: id("audit", "dataset"),
    actorId: demoFixtureIds.adminUser,
    organizationId: demoFixtureIds.platform,
    supplierId: null,
    action: "DEMO_DATASET_RECONCILED",
    entityType: "platform",
    entityId: demoFixtureIds.platform,
    previousValueJson: null,
    newValueJson: JSON.stringify({
      suppliers: 4,
      stores: 6,
      products: 40,
      orders: 20,
    }),
    createdAt: at(22, 18),
  },
];

const platformSettings = [
  {
    id: id("setting", "order-policy"),
    key: "hosted-demo-order-policy",
    valueJson: JSON.stringify({
      cancellationWindowMinutes: 30,
      defaultCurrency: "OMR",
    }),
  },
  {
    id: id("setting", "delivery-regions"),
    key: "hosted-demo-delivery-regions",
    valueJson: JSON.stringify([
      "Muscat",
      "Dakhiliyah",
      "Batinah",
      "Dhofar",
      "Sharqiyah",
    ]),
  },
];

export const demoFixtures = {
  platform,
  suppliers,
  stores,
  organizations: [platform, ...suppliers, ...stores],
  addresses: [...storeAddresses, ...warehouseAddresses],
  warehouses,
  users,
  plan,
  subscriptions,
  categories,
  products,
  stocks,
  carts,
  cartItems,
  recurringOrders,
  orders,
  orderEvents,
  movements,
  invoices,
  paymentAttempts,
  deliveries,
  deliveryEvents,
  notifications,
  supportTickets,
  auditLogs,
  platformSettings,
} as const;

export type DemoFixtures = typeof demoFixtures;

export const demoFixtureCounts = {
  suppliers: demoFixtures.suppliers.length,
  stores: demoFixtures.stores.length,
  products: demoFixtures.products.length,
  drivers: demoFixtures.users.filter(({ role }) => role === "DRIVER").length,
  orders: demoFixtures.orders.length,
  warehouses: demoFixtures.warehouses.length,
  subscriptions: demoFixtures.subscriptions.length,
};

export function validateDemoFixtures(fixtures: DemoFixtures): void {
  const collections = Object.entries(fixtures).filter(
    ([name, value]) => name !== "organizations" && Array.isArray(value),
  ) as Array<[string, readonly { id: string }[]]>;
  const ids = new Set<string>([fixtures.platform.id]);
  for (const [, records] of collections) {
    for (const record of records) {
      if (!record.id.startsWith("hosted-demo-")) {
        throw new Error(
          `Demo fixture id is outside the reserved namespace: ${record.id}`,
        );
      }
      if (ids.has(record.id))
        throw new Error(`Duplicate demo fixture id: ${record.id}`);
      ids.add(record.id);
    }
  }

  assertUnique(
    fixtures.users.map(({ email }) => email.toLowerCase()),
    "email",
  );
  assertUnique(
    fixtures.products.map(({ supplierId, sku }) => `${supplierId}:${sku}`),
    "supplier SKU",
  );

  const organizationIds = new Set(
    fixtures.organizations.map(({ id: value }) => value),
  );
  const userIds = new Set(fixtures.users.map(({ id: value }) => value));
  const productIds = new Set(fixtures.products.map(({ id: value }) => value));
  const warehouseIds = new Set(
    fixtures.warehouses.map(({ id: value }) => value),
  );
  const addressIds = new Set(fixtures.addresses.map(({ id: value }) => value));
  for (const user of fixtures.users) {
    if (user.organizationId && !organizationIds.has(user.organizationId)) {
      throw new Error(`Demo user references missing organization: ${user.id}`);
    }
  }
  for (const warehouse of fixtures.warehouses) {
    if (
      !organizationIds.has(warehouse.supplierId) ||
      !addressIds.has(warehouse.addressId)
    ) {
      throw new Error(
        `Demo warehouse has an invalid reference: ${warehouse.id}`,
      );
    }
  }
  for (const product of fixtures.products) {
    if (!organizationIds.has(product.supplierId)) {
      throw new Error(
        `Demo product references missing supplier: ${product.id}`,
      );
    }
    if (!fixtures.stocks.some(({ productId }) => productId === product.id)) {
      throw new Error(`Demo product has no warehouse stock: ${product.id}`);
    }
    if (
      product.status === "PUBLISHED" &&
      (!product.description || !product.imageUrl)
    ) {
      throw new Error(`Published demo product is incomplete: ${product.id}`);
    }
  }
  for (const stock of fixtures.stocks) {
    if (
      !productIds.has(stock.productId) ||
      !warehouseIds.has(stock.warehouseId)
    ) {
      throw new Error(`Demo stock has an invalid reference: ${stock.id}`);
    }
  }
  const invoiceOrderIds = new Set(
    fixtures.invoices.map(({ orderId }) => orderId),
  );
  const deliveryOrderIds = new Set(
    fixtures.deliveries.map(({ orderId }) => orderId),
  );
  for (const order of fixtures.orders) {
    if (
      !organizationIds.has(order.supplierId) ||
      !organizationIds.has(order.storeId) ||
      !userIds.has(order.createdById) ||
      !addressIds.has(order.deliveryAddressId)
    ) {
      throw new Error(`Demo order has an invalid reference: ${order.id}`);
    }
    const subtotal = order.items.reduce(
      (sum, item) => sum + item.lineSubtotalBaisa,
      0,
    );
    const tax = order.items.reduce((sum, item) => sum + item.lineTaxBaisa, 0);
    if (
      subtotal !== order.subtotalBaisa ||
      tax !== order.taxBaisa ||
      subtotal + tax + order.shippingBaisa - order.discountBaisa !==
        order.totalBaisa
    ) {
      throw new Error(`Demo order totals are inconsistent: ${order.id}`);
    }
    if (
      [
        "ACCEPTED",
        "PREPARING",
        "READY_FOR_DELIVERY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ].includes(order.status) &&
      !invoiceOrderIds.has(order.id)
    ) {
      throw new Error(`Demo order status requires an invoice: ${order.id}`);
    }
    if (
      ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY", "DELIVERED"].includes(
        order.status,
      ) &&
      !deliveryOrderIds.has(order.id)
    ) {
      throw new Error(`Demo order status requires a delivery: ${order.id}`);
    }
  }
}

function assertUnique(values: readonly string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value))
      throw new Error(`Duplicate demo fixture ${label}: ${value}`);
    seen.add(value);
  }
}
