import React from 'react';
import { Product } from '../types';

interface Props {
  products: Product[];
}

const HistoryList: React.FC<Props> = ({ products }) => {
  if (products.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow border border-slate-200">
        <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-slate-900">No history</h3>
        <p className="mt-1 text-sm text-slate-500">Classify your first product to see it here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <div key={product.id} className="bg-white rounded-lg shadow border border-slate-200 flex flex-col overflow-hidden transition hover:shadow-md">
          <div className="aspect-w-16 aspect-h-9 bg-slate-100 relative h-48">
            {product.image_base64 ? (
              <img
                src={product.image_base64.startsWith('data:') ? product.image_base64 : `data:image/jpeg;base64,${product.image_base64}`}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">No Image</div>
            )}
            <div className="absolute top-2 right-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 shadow-sm border border-indigo-200">
                {product.tax_code}
              </span>
            </div>
          </div>
          <div className="p-4 flex-1 flex flex-col">
            <h4 className="text-lg font-bold text-slate-900 mb-1">{product.name}</h4>
            <p className="text-sm text-slate-600 mb-4 line-clamp-2">{product.user_description}</p>

            <div className="mt-auto pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">AI Vision Analysis</p>
              <p className="text-xs text-slate-600 line-clamp-3 bg-slate-50 p-2 rounded">{product.ai_vision_analysis}</p>
            </div>
            <div className="mt-2 text-xs text-slate-400 text-right">
              {product.created_at ? new Date(product.created_at).toLocaleDateString() : 'Just now'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default HistoryList;