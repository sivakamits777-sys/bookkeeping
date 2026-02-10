
import React from 'react';
import { ExtractedInsight } from '../types';
import { FileText, MapPin, Eye, Box, Activity, Info, ImageOff } from 'lucide-react';

interface ExtractionPanelProps {
  data: ExtractedInsight | null;
  loading: boolean;
}

const ExtractionPanel: React.FC<ExtractionPanelProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 space-y-4 animate-pulse">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
          <Activity className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <p className="text-gray-500 font-medium">Gemini 2.5 is extracting product details...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
        <FileText className="w-16 h-16 mb-4 opacity-50" />
        <p>Upload a file to see individual product analysis</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 flex flex-col rounded-lg">
      {/* Header Summary */}
      <div className="bg-white p-6 border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="px-3 py-1 text-xs font-bold tracking-wider text-blue-700 uppercase bg-blue-100 rounded-full">
            {data.document_type}
          </span>
          <span className="text-xs text-gray-400 font-medium">
            {data.products.length} Items Found
          </span>
        </div>
        <p className="text-gray-600 text-sm leading-relaxed">
          {data.summary}
        </p>
      </div>

      {/* Product List */}
      <div className="p-6 space-y-6">
        {data.products.map((product, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200">
            {/* Product Header */}
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                  <Box className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-lg leading-tight">{product.name}</h3>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-md border border-gray-200 shadow-sm">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-semibold text-gray-700">{product.country}</span>
              </div>
            </div>

            {/* Product Body */}
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left Col: Image & Description */}
              <div className="space-y-4">
                {/* Image Section */}
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-video flex items-center justify-center relative">
                  {product.image ? (
                    <img
                      src={product.image.startsWith('data:') ? product.image : `data:image/jpeg;base64,${product.image}`}
                      alt={product.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <ImageOff className="w-8 h-8 mb-2" />
                      <span className="text-xs">No Image Extracted</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Info className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">Description</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {product.description}
                  </p>
                </div>
              </div>

              {/* Right Col: Visual Analysis */}
              <div className="flex flex-col h-full">
                <div className={`${product.visual_analysis === "Tax code assigned based on previous classification" ? 'bg-indigo-50 border-indigo-100/50' : 'bg-indigo-50/50 border-indigo-100/30'} rounded-lg p-5 border flex-1`}>
                  <div className="flex items-center gap-2 text-indigo-700 mb-3">
                    <Eye className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wide">AI Analysis & Reasoning</span>
                  </div>

                  {product.visual_analysis === "Tax code assigned based on previous classification" ? (
                    <p className="text-sm text-indigo-800 font-medium font-sans">
                      Tax code assigned based on previous classification
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Extraction Hierarchy */}
                      {product.hierarchy && (
                        <div className="space-y-2">
                          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Extraction Hierarchy</h5>
                          <div className="grid grid-cols-1 gap-1.5">
                            {product.hierarchy.split('|').map(s => s.trim()).filter(Boolean).map((step: string, idx: number) => {
                              const parts = step.split(':');
                              const label = parts[0] || '';
                              const content = parts.slice(1).join(':').trim();
                              return (
                                <div key={idx} className="flex items-start gap-2 p-2 rounded-lg border border-indigo-100/50 bg-white/50 shadow-sm">
                                  <div className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center text-[8px] font-bold text-indigo-600">
                                    {idx + 1}
                                  </div>
                                  <div>
                                    <div className="text-[9px] font-bold uppercase tracking-tighter text-indigo-500/70">{label.trim()}</div>
                                    <div className="text-[11px] font-medium text-slate-700">{content}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Classification Logic */}
                      {product.reasoning ? (
                        <div className="space-y-2">
                          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Classification Logic</h5>
                          <div className="p-3 rounded-lg border border-indigo-100/30 bg-white/30">
                            <ul className="space-y-1.5">
                              {product.reasoning.split(/(?=\d\.\s)|(?=\bStep \d:)/i).filter(Boolean).map((step: string, idx: number) => (
                                <li key={idx} className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                                  <span className="text-indigo-400 font-bold flex-shrink-0">•</span>
                                  <span>{step.trim().replace(/^\d\.\s/, '')}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(() => {
                            const lines = product.visual_analysis
                              .split(/•|\n(?=[A-Z\s]+:)/g)
                              .map(l => l.trim().replace(/^[•\s]+/, ''))
                              .filter(Boolean);

                            const systemLines = lines.filter(l => l.toUpperCase().includes("FLAGGED DUE TO LOW CONFIDENCE") || l.toUpperCase().startsWith("SYSTEM"));
                            const otherLines = lines.filter(l => !l.toUpperCase().includes("FLAGGED DUE TO LOW CONFIDENCE") && !l.toUpperCase().startsWith("SYSTEM"));

                            return (
                              <>
                                {systemLines.map((line, i) => (
                                  <div
                                    key={`sys-${i}`}
                                    className="mb-2 font-bold p-2.5 rounded border text-red-700 bg-red-50 border-red-200 text-xs shadow-sm uppercase tracking-wide"
                                  >
                                    {line}
                                  </div>
                                ))}
                                <div className="space-y-2">
                                  {otherLines.map((line, idx) => {
                                    const labelMatch = line.match(/^([A-Z\s]+):/);
                                    if (labelMatch) {
                                      const label = labelMatch[1];
                                      const content = line.slice(label.length + 1).trim();
                                      return (
                                        <div key={idx} className="flex gap-2 text-indigo-900/80 text-sm">
                                          <span className="shrink-0 text-indigo-500 font-bold">•</span>
                                          <span>
                                            <strong className="text-indigo-600 font-bold">{label}:</strong> {content}
                                          </span>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div key={idx} className="flex gap-2 text-indigo-900/80 text-sm">
                                        <span className="shrink-0 text-indigo-500 font-bold">•</span>
                                        <span>{line}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {/* Confidence Reasoning */}
                      {product.confidence_reasoning && (
                        <div className="space-y-2">
                          <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Confidence Reasoning</h5>
                          <div className="p-3 rounded-lg border-l-4 border-indigo-400/50 bg-indigo-50/50 text-indigo-800">
                            <p className="text-[11px] italic leading-relaxed">
                              "{product.confidence_reasoning}"
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-indigo-100/50">
                    <p className="text-xs text-indigo-600/60">
                      *Analysis based on image content and product details from the document.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        ))}

        {data.products.length === 0 && (
          <div className="text-center py-10 text-gray-500">
            <p>No individual products detected in the document.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtractionPanel;
