// ==============================================================================
// AETHRA Web UI — Inventory Stock Balances & Warehouse View
// ==============================================================================

import React, { useState } from 'react';
import { Card } from '../ui/Card.js';
import { Badge } from '../ui/Badge.js';
import { WebStockBalance } from '../../types/web.types.js';

export const InventoryStockView: React.FC = () => {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');

  const stockBalances: WebStockBalance[] = [
    {
      warehouseId: 'wh-blr-central',
      warehouseName: 'Bangalore Central Yard',
      productId: 'p-01',
      productName: 'Mono PERC Bifacial Solar Modules 550W',
      productCategory: 'Solar Modules',
      onHandQuantity: 320,
      reservedQuantity: 140,
      availableQuantity: 180,
      reorderLevel: 50,
      isLowStock: false,
    },
    {
      warehouseId: 'wh-blr-central',
      warehouseName: 'Bangalore Central Yard',
      productId: 'p-02',
      productName: 'Three-Phase On-Grid Solar Inverter 10kW',
      productCategory: 'Inverters',
      onHandQuantity: 8,
      reservedQuantity: 6,
      availableQuantity: 2,
      reorderLevel: 5,
      isLowStock: true,
    },
    {
      warehouseId: 'wh-hosur-hub',
      warehouseName: 'Hosur Logistics Warehouse',
      productId: 'p-03',
      productName: 'HDG Aluminium Module Mounting Rail (4.2m)',
      productCategory: 'Structure & BOS',
      onHandQuantity: 450,
      reservedQuantity: 200,
      availableQuantity: 250,
      reorderLevel: 100,
      isLowStock: false,
    },
    {
      warehouseId: 'wh-hosur-hub',
      warehouseName: 'Hosur Logistics Warehouse',
      productId: 'p-04',
      productName: '1x4 sq.mm Solar DC Cable UV Resistant (500m drum)',
      productCategory: 'Electrical Cabling',
      onHandQuantity: 4,
      reservedQuantity: 3,
      availableQuantity: 1,
      reorderLevel: 3,
      isLowStock: true,
    },
  ];

  const filteredBalances =
    selectedWarehouse === 'all'
      ? stockBalances
      : stockBalances.filter((b) => b.warehouseId === selectedWarehouse);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Inventory & Stock Ledger</h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time double-entry stock balances, negative-stock guard, and active project reservations
          </p>
        </div>

        {/* Warehouse Filter */}
        <div className="flex items-center space-x-2">
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Warehouses (Consolidated)</option>
            <option value="wh-blr-central">Bangalore Central Yard</option>
            <option value="wh-hosur-hub">Hosur Logistics Warehouse</option>
          </select>
        </div>
      </div>

      <Card title="Warehouse Stock Ledger Balances">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
              <tr>
                <th className="py-2.5 px-3">Product Name & Category</th>
                <th className="py-2.5 px-3">Warehouse Location</th>
                <th className="py-2.5 px-3 text-center">On-Hand</th>
                <th className="py-2.5 px-3 text-center">Reserved for EPC</th>
                <th className="py-2.5 px-3 text-center">Net Available</th>
                <th className="py-2.5 px-3 text-center">Stock Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBalances.map((item) => (
                <tr key={`${item.warehouseId}-${item.productId}`} className="hover:bg-slate-50">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-900">{item.productName}</div>
                    <div className="text-[10px] text-slate-500">{item.productCategory}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-600">{item.warehouseName}</td>
                  <td className="py-3 px-3 text-center font-bold text-slate-900">
                    {item.onHandQuantity}
                  </td>
                  <td className="py-3 px-3 text-center text-amber-700 font-medium">
                    {item.reservedQuantity}
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-emerald-700">
                    {item.availableQuantity}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {item.isLowStock ? (
                      <Badge variant="danger">LOW STOCK (Reorder)</Badge>
                    ) : (
                      <Badge variant="success">HEALTHY</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
