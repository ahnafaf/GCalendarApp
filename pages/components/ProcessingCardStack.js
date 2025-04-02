// components/ProcessingCardStack.js
import React from 'react';
import ProcessingCard from './ProcessingCard';

const ProcessingCardStack = ({ processingSteps, className = "", isPersistent = false }) => {
  if (!processingSteps || processingSteps.length === 0) {
    return null;
  }

  return (
    <div className={`w-full py-2 space-y-1 transition-all duration-300 ${className} ${isPersistent ? 'opacity-95' : ''}`}>
      {processingSteps.map((step, index) => (
        <ProcessingCard
          key={`step-${index}`}
          text={step.text}
          status={step.status}
          index={processingSteps.length - index - 1} // Reverse the index for proper stacking
          isPersistent={isPersistent}
        />
      ))}
    </div>
  );
};

export default ProcessingCardStack;