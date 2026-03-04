using CardanoODataService as service from './cardano-service';

// SAP Fiori UI Annotations for rapid UI5 development

// Transactions List
annotate service.Transactions with @(
  UI.LineItem: [
    { Value: txHash, Label: 'Transaction Hash' },
    { Value: blockHeight, Label: 'Block' },
    { Value: blockTime, Label: 'Time' },
    { Value: fees, Label: 'Fees (lovelace)' },
    { Value: confirmations, Label: 'Confirmations' },
    { Value: isValid, Label: 'Valid' },
    { Value: network, Label: 'Network' },
  ],
  UI.SelectionFields: [network, isValid],
);

// Supply Chain Events List
annotate service.SupplyChainEvents with @(
  UI.LineItem: [
    { Value: sapDocumentId, Label: 'SAP Document' },
    { Value: productCode, Label: 'Product' },
    { Value: quantity, Label: 'Qty' },
    { Value: status, Label: 'Status' },
    { Value: network, Label: 'Network' },
    { Value: updatedAt, Label: 'Last Update' },
  ],
  UI.SelectionFields: [status, network, sapSystemId],
  UI.HeaderInfo: {
    TypeName: 'Supply Chain Event',
    TypeNamePlural: 'Supply Chain Events',
    Title: { Value: sapDocumentId },
    Description: { Value: productCode },
  }
);

// ESG Credits List
annotate service.EsgCredits with @(
  UI.LineItem: [
    { Value: creditId, Label: 'Credit ID' },
    { Value: creditType, Label: 'Type' },
    { Value: amount, Label: 'Amount' },
    { Value: unit, Label: 'Unit' },
    { Value: vintageYear, Label: 'Vintage Year' },
    { Value: isRetired, Label: 'Retired' },
    { Value: sapCostCenter, Label: 'Cost Center' },
  ],
  UI.SelectionFields: [creditType, isRetired, vintageYear, sapCostCenter],
);

// Payment Settlements List
annotate service.PaymentSettlements with @(
  UI.LineItem: [
    { Value: settlementId, Label: 'Settlement ID' },
    { Value: sapInvoiceId, Label: 'SAP Invoice' },
    { Value: totalAmount, Label: 'Total (lovelace)' },
    { Value: status, Label: 'Status' },
    { Value: deadline, Label: 'Deadline' },
  ],
  UI.SelectionFields: [status, sapSystemId],
);

// Asset Registry List
annotate service.AssetRegistry with @(
  UI.LineItem: [
    { Value: assetId, Label: 'Asset ID' },
    { Value: assetType, Label: 'Type' },
    { Value: sapAssetNumber, Label: 'SAP Asset No.' },
    { Value: sapPlant, Label: 'Plant' },
    { Value: quantity, Label: 'Quantity' },
    { Value: state, Label: 'State' },
  ],
  UI.SelectionFields: [assetType, state, sapPlant],
);
