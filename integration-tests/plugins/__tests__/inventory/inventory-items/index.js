const path = require("path")

const { bootstrapApp } = require("../../../../helpers/bootstrap-app")
const { initDb, useDb } = require("../../../../helpers/use-db")
const { setPort, useApi } = require("../../../../helpers/use-api")

const adminSeeder = require("../../../helpers/admin-seeder")

jest.setTimeout(30000)

const { simpleProductFactory } = require("../../../factories")
const adminHeaders = { headers: { Authorization: "Bearer test_token" } }

describe("Inventory Items endpoints", () => {
  let appContainer
  let dbConnection
  let express

  let variantId
  let inventoryItems
  let locationId
  let location2Id
  let location3Id

  beforeAll(async () => {
    const cwd = path.resolve(path.join(__dirname, "..", "..", ".."))
    dbConnection = await initDb({ cwd })
    const { container, app, port } = await bootstrapApp({ cwd })
    appContainer = container

    setPort(port)
    express = app.listen(port, (err) => {
      process.send(port)
    })
  })

  beforeEach(async () => {
    // create inventory item
    await adminSeeder(dbConnection)

    const api = useApi()

    await simpleProductFactory(
      dbConnection,
      {
        id: "test-product",
        variants: [],
      },
      100
    )

    const prodVarInventoryService = appContainer.resolve(
      "productVariantInventoryService"
    )

    const response = await api.post(
      `/admin/products/test-product/variants`,
      {
        title: "Test Variant w. inventory",
        sku: "MY_SKU",
        material: "material",
        origin_country: "UK",
        hs_code: "hs001",
        mid_code: "mids",
        weight: 300,
        length: 100,
        height: 200,
        width: 150,
        manage_inventory: true,
        options: [
          {
            option_id: "test-product-option",
            value: "SS",
          },
        ],
        prices: [{ currency_code: "usd", amount: 2300 }],
      },
      adminHeaders
    )

    const variant = response.data.product.variants[0]

    variantId = variant.id

    inventoryItems = await prodVarInventoryService.listInventoryItemsByVariant(
      variantId
    )

    const stockRes = await api.post(
      `/admin/stock-locations`,
      {
        name: "Fake Warehouse",
      },
      adminHeaders
    )
    locationId = stockRes.data.stock_location.id

    const secondStockRes = await api.post(
      `/admin/stock-locations`,
      {
        name: "Another random Warehouse",
      },
      adminHeaders
    )
    location2Id = secondStockRes.data.stock_location.id

    const thirdStockRes = await api.post(
      `/admin/stock-locations`,
      {
        name: "Another random Warehouse",
      },
      adminHeaders
    )
    location3Id = thirdStockRes.data.stock_location.id
  })

  afterAll(async () => {
    const db = useDb()
    await db.shutdown()
    express.close()
  })

  afterEach(async () => {
    jest.clearAllMocks()
    const db = useDb()
    return await db.teardown()
  })

  describe("Inventory Items", () => {
    it("Create, update and delete inventory location level", async () => {
      const api = useApi()
      const inventoryItemId = inventoryItems[0].id

      await api.post(
        `/admin/inventory-items/${inventoryItemId}/location-levels`,
        {
          location_id: locationId,
          stocked_quantity: 17,
          incoming_quantity: 2,
        },
        adminHeaders
      )

      const inventoryService = appContainer.resolve("inventoryService")
      const stockLevel = await inventoryService.retrieveInventoryLevel(
        inventoryItemId,
        locationId
      )

      expect(stockLevel.location_id).toEqual(locationId)
      expect(stockLevel.inventory_item_id).toEqual(inventoryItemId)
      expect(stockLevel.stocked_quantity).toEqual(17)
      expect(stockLevel.incoming_quantity).toEqual(2)

      await api.post(
        `/admin/inventory-items/${inventoryItemId}/location-levels/${locationId}`,
        {
          stocked_quantity: 21,
          incoming_quantity: 0,
        },
        adminHeaders
      )

      const newStockLevel = await inventoryService.retrieveInventoryLevel(
        inventoryItemId,
        locationId
      )
      expect(newStockLevel.stocked_quantity).toEqual(21)
      expect(newStockLevel.incoming_quantity).toEqual(0)

      await api.delete(
        `/admin/inventory-items/${inventoryItemId}/location-levels/${locationId}`,
        adminHeaders
      )
      const invLevel = await inventoryService
        .retrieveInventoryLevel(inventoryItemId, locationId)
        .catch((e) => e)

      expect(invLevel.message).toEqual(
        `Inventory level for item ${inventoryItemId} and location ${locationId} not found`
      )
    })

    it("Update inventory item", async () => {
      const api = useApi()
      const inventoryItemId = inventoryItems[0].id

      const response = await api.post(
        `/admin/inventory-items/${inventoryItemId}`,
        {
          mid_code: "updated mid_code",
          weight: 120,
        },
        adminHeaders
      )

      expect(response.data.inventory_item).toEqual(
        expect.objectContaining({
          origin_country: "UK",
          hs_code: "hs001",
          mid_code: "updated mid_code",
          weight: 120,
          length: 100,
          height: 200,
          width: 150,
        })
      )
    })

    it("Retrieve an inventory item", async () => {
      const api = useApi()
      const inventoryItemId = inventoryItems[0].id

      await api.post(
        `/admin/inventory-items/${inventoryItemId}/location-levels`,
        {
          location_id: locationId,
          stocked_quantity: 15,
          incoming_quantity: 5,
        },
        adminHeaders
      )

      await api.post(
        `/admin/inventory-items/${inventoryItemId}/location-levels`,
        {
          location_id: location2Id,
          stocked_quantity: 7,
          incoming_quantity: 0,
        },
        adminHeaders
      )

      const response = await api.get(
        `/admin/inventory-items/${inventoryItemId}`,
        adminHeaders
      )

      expect(response.data).toEqual({
        inventory_item: expect.objectContaining({
          height: 200,
          hs_code: "hs001",
          id: inventoryItemId,
          length: 100,
          location_levels: [
            expect.objectContaining({
              available_quantity: 15,
              deleted_at: null,
              id: expect.any(String),
              incoming_quantity: 5,
              inventory_item_id: inventoryItemId,
              location_id: locationId,
              metadata: null,
              reserved_quantity: 0,
              stocked_quantity: 15,
            }),
            expect.objectContaining({
              available_quantity: 7,
              deleted_at: null,
              id: expect.any(String),
              incoming_quantity: 0,
              inventory_item_id: inventoryItemId,
              location_id: location2Id,
              metadata: null,
              reserved_quantity: 0,
              stocked_quantity: 7,
            }),
          ],
          material: "material",
          metadata: null,
          mid_code: "mids",
          origin_country: "UK",
          requires_shipping: true,
          sku: "MY_SKU",
          weight: 300,
          width: 150,
        }),
      })
    })

    it("List inventory items", async () => {
      const api = useApi()
      const inventoryItemId = inventoryItems[0].id

      await api.post(
        `/admin/inventory-items/${inventoryItemId}/location-levels`,
        {
          location_id: location2Id,
          stocked_quantity: 10,
        },
        adminHeaders
      )

      await api.post(
        `/admin/inventory-items/${inventoryItemId}/location-levels`,
        {
          location_id: location3Id,
          stocked_quantity: 5,
        },
        adminHeaders
      )

      const response = await api.get(`/admin/inventory-items`, adminHeaders)

      expect(response.data.inventory_items).toEqual([
        expect.objectContaining({
          id: inventoryItemId,
          sku: "MY_SKU",
          origin_country: "UK",
          hs_code: "hs001",
          mid_code: "mids",
          material: "material",
          weight: 300,
          length: 100,
          height: 200,
          width: 150,
          requires_shipping: true,
          metadata: null,
          variants: expect.arrayContaining([
            expect.objectContaining({
              id: variantId,
              title: "Test Variant w. inventory",
              product_id: "test-product",
              sku: "MY_SKU",
              manage_inventory: true,
              hs_code: "hs001",
              origin_country: "UK",
              mid_code: "mids",
              material: "material",
              weight: 300,
              length: 100,
              height: 200,
              width: 150,
              metadata: null,
              product: expect.objectContaining({
                id: "test-product",
              }),
            }),
          ]),
          location_levels: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              inventory_item_id: inventoryItemId,
              location_id: location2Id,
              stocked_quantity: 10,
              reserved_quantity: 0,
              incoming_quantity: 0,
              metadata: null,
              available_quantity: 10,
            }),
            expect.objectContaining({
              id: expect.any(String),
              inventory_item_id: inventoryItemId,
              location_id: location3Id,
              stocked_quantity: 5,
              reserved_quantity: 0,
              incoming_quantity: 0,
              metadata: null,
              available_quantity: 5,
            }),
          ]),
        }),
      ])
    })
  })
})
