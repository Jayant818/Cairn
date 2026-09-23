/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/cairn.json`.
 */
export type Cairn = {
  "address": "EY5qnrQjqEsAQ65Nrd8Zd3DcqAmemzmgCYfiGfC15vCL",
  "metadata": {
    "name": "cairn",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Token-2022 equity lending markets"
  },
  "instructions": [
    {
      "name": "accrueInterest",
      "discriminator": [
        47,
        40,
        115,
        198,
        91,
        12,
        222,
        49
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ]
          }
        },
        {
          "name": "equityMint",
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "borrow",
      "discriminator": [
        228,
        253,
        131,
        202,
        207,
        116,
        89,
        18
      ],
      "accounts": [
        {
          "name": "borrower",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ]
          },
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "borrower"
              }
            ]
          }
        },
        {
          "name": "equityMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "equityVault",
          "writable": true
        },
        {
          "name": "borrowerEquity",
          "writable": true
        },
        {
          "name": "equitySpot"
        },
        {
          "name": "equityTwap"
        },
        {
          "name": "collateralSpot"
        },
        {
          "name": "collateralTwap"
        },
        {
          "name": "equityTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deposit",
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "depositor",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ]
          }
        },
        {
          "name": "equityMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "receiptMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "equityVault",
          "writable": true
        },
        {
          "name": "depositorEquity",
          "writable": true
        },
        {
          "name": "depositorReceipt",
          "writable": true
        },
        {
          "name": "equityTokenProgram"
        },
        {
          "name": "receiptTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "depositCollateral",
      "discriminator": [
        156,
        131,
        142,
        116,
        146,
        247,
        162,
        120
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "ownerCollateral",
          "writable": true
        },
        {
          "name": "collateralTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeMarket",
      "discriminator": [
        35,
        35,
        189,
        193,
        155,
        48,
        170,
        203
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ]
          }
        },
        {
          "name": "equityMint"
        },
        {
          "name": "receiptMint",
          "writable": true
        },
        {
          "name": "collateralMint"
        },
        {
          "name": "equityVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "equityTokenProgram"
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "collateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "collateralTokenProgram"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "equityTokenProgram"
        },
        {
          "name": "receiptTokenProgram"
        },
        {
          "name": "collateralTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "marketConfig"
            }
          }
        }
      ]
    },
    {
      "name": "initializePosition",
      "discriminator": [
        219,
        192,
        234,
        71,
        190,
        191,
        102,
        80
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market"
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "liquidate",
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "liquidator",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ]
          },
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "equityMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "equityVault",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "liquidatorEquity",
          "writable": true
        },
        {
          "name": "liquidatorCollateral",
          "writable": true
        },
        {
          "name": "equitySpot"
        },
        {
          "name": "equityTwap"
        },
        {
          "name": "collateralSpot"
        },
        {
          "name": "collateralTwap"
        },
        {
          "name": "equityTokenProgram"
        },
        {
          "name": "collateralTokenProgram"
        }
      ],
      "args": [
        {
          "name": "requestedRepay",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reconcileCash",
      "discriminator": [
        21,
        100,
        249,
        100,
        89,
        77,
        187,
        8
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "equityMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "equityVault"
        }
      ],
      "args": []
    },
    {
      "name": "redeem",
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "redeemer",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ]
          }
        },
        {
          "name": "equityMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "receiptMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "equityVault",
          "writable": true
        },
        {
          "name": "redeemerEquity",
          "writable": true
        },
        {
          "name": "redeemerReceipt",
          "writable": true
        },
        {
          "name": "equityTokenProgram"
        },
        {
          "name": "receiptTokenProgram"
        }
      ],
      "args": [
        {
          "name": "receiptAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "repay",
      "discriminator": [
        234,
        103,
        67,
        82,
        208,
        234,
        219,
        166
      ],
      "accounts": [
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ]
          },
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "equityMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "equityVault",
          "writable": true
        },
        {
          "name": "payerEquity",
          "writable": true
        },
        {
          "name": "equityTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setMarketConfig",
      "discriminator": [
        128,
        237,
        216,
        59,
        122,
        62,
        156,
        30
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "config",
          "type": {
            "defined": {
              "name": "marketConfig"
            }
          }
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "depositsPaused",
          "type": "bool"
        },
        {
          "name": "borrowsPaused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "withdrawCollateral",
      "discriminator": [
        115,
        135,
        168,
        106,
        139,
        214,
        138,
        150
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "equityMint"
              }
            ]
          },
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "equityMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "ownerCollateral",
          "writable": true
        },
        {
          "name": "equitySpot"
        },
        {
          "name": "equityTwap"
        },
        {
          "name": "collateralSpot"
        },
        {
          "name": "collateralTwap"
        },
        {
          "name": "collateralTokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "priceUpdateV2",
      "discriminator": [
        34,
        241,
        35,
        99,
        157,
        126,
        244,
        205
      ]
    },
    {
      "name": "twapUpdate",
      "discriminator": [
        104,
        192,
        188,
        72,
        246,
        166,
        12,
        81
      ]
    }
  ],
  "events": [
    {
      "name": "borrowed",
      "discriminator": [
        225,
        182,
        241,
        78,
        34,
        145,
        253,
        230
      ]
    },
    {
      "name": "cashReconciled",
      "discriminator": [
        120,
        75,
        185,
        43,
        111,
        151,
        115,
        95
      ]
    },
    {
      "name": "collateralDeposited",
      "discriminator": [
        244,
        62,
        77,
        11,
        135,
        112,
        61,
        96
      ]
    },
    {
      "name": "collateralWithdrawn",
      "discriminator": [
        51,
        224,
        133,
        106,
        74,
        173,
        72,
        82
      ]
    },
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "interestAccrued",
      "discriminator": [
        79,
        218,
        196,
        73,
        32,
        148,
        138,
        71
      ]
    },
    {
      "name": "liquidated",
      "discriminator": [
        231,
        57,
        55,
        75,
        0,
        170,
        246,
        68
      ]
    },
    {
      "name": "marketInitialized",
      "discriminator": [
        134,
        160,
        122,
        87,
        50,
        3,
        255,
        81
      ]
    },
    {
      "name": "pauseChanged",
      "discriminator": [
        238,
        188,
        213,
        78,
        134,
        209,
        178,
        218
      ]
    },
    {
      "name": "redeemed",
      "discriminator": [
        14,
        29,
        183,
        71,
        31,
        165,
        107,
        38
      ]
    },
    {
      "name": "repaid",
      "discriminator": [
        38,
        248,
        231,
        7,
        150,
        164,
        172,
        23
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "arithmetic overflow"
    },
    {
      "code": 6001,
      "name": "zeroAmount",
      "msg": "amount must be greater than zero"
    },
    {
      "code": 6002,
      "name": "invalidConfig",
      "msg": "configuration is invalid"
    },
    {
      "code": 6003,
      "name": "depositsPaused",
      "msg": "market deposits are paused"
    },
    {
      "code": 6004,
      "name": "borrowsPaused",
      "msg": "market borrowing is paused"
    },
    {
      "code": 6005,
      "name": "depositCapExceeded",
      "msg": "deposit cap exceeded"
    },
    {
      "code": 6006,
      "name": "borrowCapExceeded",
      "msg": "borrow cap exceeded"
    },
    {
      "code": 6007,
      "name": "insufficientLiquidity",
      "msg": "insufficient available equity"
    },
    {
      "code": 6008,
      "name": "depositTooSmall",
      "msg": "amount rounds to zero receipt tokens"
    },
    {
      "code": 6009,
      "name": "invalidReceiptAmount",
      "msg": "receipt amount is invalid"
    },
    {
      "code": 6010,
      "name": "invalidCollateralAmount",
      "msg": "collateral amount is invalid"
    },
    {
      "code": 6011,
      "name": "unhealthyPosition",
      "msg": "position would be unhealthy"
    },
    {
      "code": 6012,
      "name": "positionHealthy",
      "msg": "position is healthy"
    },
    {
      "code": 6013,
      "name": "repayTooLarge",
      "msg": "repayment exceeds the current debt"
    },
    {
      "code": 6014,
      "name": "repayTooSmall",
      "msg": "repayment rounds to zero debt shares"
    },
    {
      "code": 6015,
      "name": "oracleConfidenceTooWide",
      "msg": "oracle confidence interval is too wide"
    },
    {
      "code": 6016,
      "name": "oracleDeviationTooLarge",
      "msg": "spot price differs too much from TWAP"
    },
    {
      "code": 6017,
      "name": "invalidOraclePrice",
      "msg": "oracle price is invalid"
    },
    {
      "code": 6018,
      "name": "twapQualityTooLow",
      "msg": "TWAP missed-slot ratio is too high"
    },
    {
      "code": 6019,
      "name": "unsupportedOracleExponent",
      "msg": "oracle exponent is outside the supported range"
    },
    {
      "code": 6020,
      "name": "mintPolicyMismatch",
      "msg": "mint policy does not match the approved market policy"
    },
    {
      "code": 6021,
      "name": "mintIsClosable",
      "msg": "mint can be closed and recreated"
    },
    {
      "code": 6022,
      "name": "invalidReceiptAuthority",
      "msg": "receipt mint authority must be the market PDA"
    },
    {
      "code": 6023,
      "name": "decimalMismatch",
      "msg": "receipt and equity decimals must match"
    },
    {
      "code": 6024,
      "name": "receiptMustUseToken2022",
      "msg": "receipt mint must use Token-2022"
    },
    {
      "code": 6025,
      "name": "invalidTokenProgram",
      "msg": "token program does not own the supplied mint"
    },
    {
      "code": 6026,
      "name": "collateralMustUseClassicToken",
      "msg": "collateral mint must use the classic SPL Token program"
    },
    {
      "code": 6027,
      "name": "positionHasDebt",
      "msg": "position still has debt"
    },
    {
      "code": 6028,
      "name": "liquidationTooSmall",
      "msg": "liquidation produced no collateral"
    }
  ],
  "types": [
    {
      "name": "borrowed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "debtShares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "cashReconciled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "actual",
            "type": "u64"
          },
          {
            "name": "loss",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "collateralDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "collateralWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "assets",
            "type": "u64"
          },
          {
            "name": "receipts",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "interestAccrued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "borrowIndex",
            "type": "u128"
          },
          {
            "name": "reserves",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "liquidated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "repaid",
            "type": "u64"
          },
          {
            "name": "collateralSeized",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "equityMint",
            "type": "pubkey"
          },
          {
            "name": "receiptMint",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          },
          {
            "name": "equityTokenProgram",
            "type": "pubkey"
          },
          {
            "name": "collateralTokenProgram",
            "type": "pubkey"
          },
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "marketConfig"
              }
            }
          },
          {
            "name": "cash",
            "type": "u64"
          },
          {
            "name": "totalDebtShares",
            "type": "u128"
          },
          {
            "name": "borrowIndex",
            "type": "u128"
          },
          {
            "name": "reserves",
            "type": "u64"
          },
          {
            "name": "totalCollateral",
            "type": "u64"
          },
          {
            "name": "lastAccrualTimestamp",
            "type": "i64"
          },
          {
            "name": "depositsPaused",
            "type": "bool"
          },
          {
            "name": "borrowsPaused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "equityFeedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "collateralFeedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "maxPriceAgeSeconds",
            "type": "u64"
          },
          {
            "name": "twapWindowSeconds",
            "type": "u64"
          },
          {
            "name": "maxConfidenceBps",
            "type": "u16"
          },
          {
            "name": "maxSpotTwapDeviationBps",
            "type": "u16"
          },
          {
            "name": "maxTwapDownSlotsRatio",
            "type": "u32"
          },
          {
            "name": "loanToValueBps",
            "type": "u16"
          },
          {
            "name": "liquidationThresholdBps",
            "type": "u16"
          },
          {
            "name": "liquidationBonusBps",
            "type": "u16"
          },
          {
            "name": "closeFactorBps",
            "type": "u16"
          },
          {
            "name": "reserveFactorBps",
            "type": "u16"
          },
          {
            "name": "baseRateBps",
            "type": "u16"
          },
          {
            "name": "slope1Bps",
            "type": "u16"
          },
          {
            "name": "slope2Bps",
            "type": "u16"
          },
          {
            "name": "kinkBps",
            "type": "u16"
          },
          {
            "name": "depositCap",
            "type": "u64"
          },
          {
            "name": "borrowCap",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marketInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "equityMint",
            "type": "pubkey"
          },
          {
            "name": "receiptMint",
            "type": "pubkey"
          },
          {
            "name": "collateralMint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "pauseChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depositsPaused",
            "type": "bool"
          },
          {
            "name": "borrowsPaused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "debtShares",
            "type": "u128"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "priceFeedMessage",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "publishTime",
            "docs": [
              "The timestamp of this price update in seconds"
            ],
            "type": "i64"
          },
          {
            "name": "prevPublishTime",
            "docs": [
              "The timestamp of the previous price update. This field is intended to allow users to",
              "identify the single unique price update for any moment in time:",
              "for any time t, the unique update is the one such that prev_publish_time < t <= publish_time.",
              "",
              "Note that there may not be such an update while we are migrating to the new message-sending logic,",
              "as some price updates on pythnet may not be sent to other chains (because the message-sending",
              "logic may not have triggered). We can solve this problem by making the message-sending mandatory",
              "(which we can do once publishers have migrated over).",
              "",
              "Additionally, this field may be equal to publish_time if the message is sent on a slot where",
              "where the aggregation was unsuccesful. This problem will go away once all publishers have",
              "migrated over to a recent version of pyth-agent."
            ],
            "type": "i64"
          },
          {
            "name": "emaPrice",
            "type": "i64"
          },
          {
            "name": "emaConf",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdateV2",
      "docs": [
        "A price update account. This account is used by the Pyth Receiver program to store a verified price update from a Pyth price feed.",
        "It contains:",
        "- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different price update.",
        "- `verification_level`: The [`VerificationLevel`] of this price update. This represents how many Wormhole guardian signatures have been verified for this price update.",
        "- `price_message`: The actual price update.",
        "- `posted_slot`: The slot at which this price update was posted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "writeAuthority",
            "type": "pubkey"
          },
          {
            "name": "verificationLevel",
            "type": {
              "defined": {
                "name": "verificationLevel"
              }
            }
          },
          {
            "name": "priceMessage",
            "type": {
              "defined": {
                "name": "priceFeedMessage"
              }
            }
          },
          {
            "name": "postedSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "redeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "receipts",
            "type": "u64"
          },
          {
            "name": "assets",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "repaid",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "debtShares",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "twapPrice",
      "docs": [
        "The time weighted average price & conf for a feed over the window [start_time, end_time].",
        "This type is used to persist the calculated TWAP in TwapUpdate accounts on Solana."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "downSlotsRatio",
            "docs": [
              "Ratio out of 1_000_000, where a value of 1_000_000 represents",
              "all slots were missed and 0 represents no slots were missed."
            ],
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "twapUpdate",
      "docs": [
        "A time weighted average price account.",
        "This account is used by the Pyth Receiver program to store a TWAP update from a Pyth price feed.",
        "TwapUpdates can only be created after the client has verified the VAAs via the Wormhole contract.",
        "Check out `target_chains/solana/cli/src/main.rs` for an example of how to do this.",
        "",
        "It contains:",
        "- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different TWAP update.",
        "- `twap`: The actual TWAP update."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "writeAuthority",
            "type": "pubkey"
          },
          {
            "name": "twap",
            "type": {
              "defined": {
                "name": "twapPrice"
              }
            }
          }
        ]
      }
    },
    {
      "name": "verificationLevel",
      "docs": [
        "Pyth price updates are bridged to all blockchains via Wormhole.",
        "Using the price updates on another chain requires verifying the signatures of the Wormhole guardians.",
        "The usual process is to check the signatures for two thirds of the total number of guardians, but this can be cumbersome on Solana because of the transaction size limits,",
        "so we also allow for partial verification.",
        "",
        "This enum represents how much a price update has been verified:",
        "- If `Full`, we have verified the signatures for two thirds of the current guardians.",
        "- If `Partial`, only `num_signatures` guardian signatures have been checked.",
        "",
        "# Warning",
        "Using partially verified price updates is dangerous, as it lowers the threshold of guardians that need to collude to produce a malicious price update."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "partial",
            "fields": [
              {
                "name": "numSignatures",
                "type": "u8"
              }
            ]
          },
          {
            "name": "full"
          }
        ]
      }
    }
  ]
};
