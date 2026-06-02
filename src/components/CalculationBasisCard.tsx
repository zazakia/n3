import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoanCalculatorService } from '../services/LoanCalculatorService';
import { formatPHP } from '../utils/currency';

// Enable Android LayoutAnimations
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CalculationBasisCardProps {
    interestType?: string;
    title?: string;
    // Props to hold active loan numbers for live calculation UX
    principalAmount?: number;
    interestRate?: number;
    interestAmount?: number;
    totalAmount?: number;
    depositAmount?: number;
    insuranceAmount?: number;
    installmentAmount?: number;
    numPayments?: number;
    deductedAmount?: number;
}

export function CalculationBasisCard({ 
    interestType = 'flat', 
    title = 'Payment Distribution Logic',
    principalAmount,
    interestRate,
    interestAmount,
    totalAmount,
    depositAmount,
    insuranceAmount,
    installmentAmount,
    numPayments,
    deductedAmount
}: CalculationBasisCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const basis = LoanCalculatorService.getFormulaBasis(interestType);

    const toggleExpanded = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    const hasLiveValues = principalAmount !== undefined && principalAmount > 0;

    return (
        <View className="bg-white rounded-3xl border border-gray-100 mt-4 shadow-sm overflow-hidden">
            <Pressable 
                onPress={toggleExpanded}
                className="flex-row items-center justify-between p-5 active:bg-gray-50"
            >
                <View className="flex-row items-center flex-1 pr-2">
                    <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center mr-3">
                        <MaterialIcons name="info-outline" size={18} color="#1D4ED8" />
                    </View>
                    <View className="flex-1">
                        <Text className="text-sm font-black text-gray-900 tracking-tight">{title}</Text>
                        <Text className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">
                            {isExpanded ? 'Hide explanation' : 'Click to view formulas & logic'}
                        </Text>
                    </View>
                </View>
                <MaterialIcons 
                    name={isExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                    size={24} 
                    color="#4B5563" 
                />
            </Pressable>

            {isExpanded && (
                <View className="px-5 pb-6 pt-2 bg-gray-50/50 border-t border-gray-100">
                    
                    {/* 1. Total Interest Formula & Computation */}
                    <FormulaItem 
                        label="Total Interest" 
                        formula={basis.interest} 
                        description="Calculated based on the selected interest rate and principal amount."
                        liveCalc={hasLiveValues && interestType === 'flat' ? (
                            `${formatPHP(principalAmount)} × (${interestRate}% / 100) = ${formatPHP(interestAmount)}`
                        ) : undefined}
                    />

                    {/* 2. Total Loan Formula & Computation */}
                    <FormulaItem 
                        label="Total Loan" 
                        formula={basis.totalLoan} 
                        description="The aggregate amount that includes principal, interest, and all fees/savings."
                        liveCalc={hasLiveValues ? (
                            `${formatPHP(principalAmount)} + ${formatPHP(interestAmount)} + ${formatPHP((depositAmount || 0) * (numPayments || 1))} + ${formatPHP((insuranceAmount || 0) * (numPayments || 1))} = ${formatPHP(totalAmount)}`
                        ) : undefined}
                    />

                    {/* 3. Installment Formula & Computation */}
                    <FormulaItem 
                        label="Installment" 
                        formula={basis.installment} 
                        description="The amount collected per payment frequency (Daily, Weekly, etc.)"
                        liveCalc={hasLiveValues ? (
                            `${formatPHP(totalAmount)} / ${numPayments} terms = ${formatPHP(installmentAmount)} / payment`
                        ) : undefined}
                    />

                    {/* 4. Net Release Formula & Computation */}
                    <FormulaItem 
                        label="Net Release" 
                        formula={basis.netRelease} 
                        description="The actual cash received by the borrower after deducting upfront costs or renewal balances."
                        liveCalc={hasLiveValues ? (
                            `${formatPHP(principalAmount)} - Upfront Deductions (${formatPHP(deductedAmount)}) = ${formatPHP(principalAmount - (deductedAmount || 0))}`
                        ) : undefined}
                    />
                </View>
            )}
        </View>
    );
}

function FormulaItem({ 
    label, 
    formula, 
    description,
    liveCalc 
}: { 
    label: string; 
    formula: string; 
    description: string;
    liveCalc?: string;
}) {
    return (
        <View className="mb-4">
            <Text className="text-[10px] font-bold text-blue-600 uppercase mb-1 tracking-wider">{label}</Text>
            <View className="bg-white p-3 rounded-xl border border-blue-50/50 shadow-sm">
                <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Formula</Text>
                <Text className="text-sm font-black text-gray-900 mb-2">{formula}</Text>
                
                {!!liveCalc && (
                    <View className="border-t border-dashed border-gray-100 pt-2 mt-1 mb-2">
                        <Text className="text-xs font-bold text-green-700 uppercase tracking-widest mb-0.5">This Loan's Computation</Text>
                        <Text className="text-sm font-black text-green-800">{liveCalc}</Text>
                    </View>
                )}
                
                <Text className="text-[10px] text-gray-500 leading-3">{description}</Text>
            </View>
        </View>
    );
}
