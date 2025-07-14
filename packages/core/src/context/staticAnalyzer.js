/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';

export interface FileNode {
  id: string;
  type: 'file';
  path: string;
  relativePath: string;
  language: string;
  size: number;
  lastModified: Date;
}

export interface FunctionNode {
  id: string;
  type: 'function' | 'method';
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  parameters?: string[];
  isExported: boolean;
  isAsync: boolean;
  visibility?: 'public' | 'private' | 'protected';
}

export interface ClassNode {
  id: string;
  type: 'class';
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  isExported: boolean;
  methods: string[];
  properties: string[];
  extends?: string;
  implements?: string[];
}

export interface ImportRelation {
  id: string;
  type: 'IMPORTS';
  from: string; // file path
  to: string;   // imported module/file
  importedNames?: string[];
  isDefault: boolean;
  isDynamic: boolean;
}

export interface CallRelation {
  id: string;
  type: 'CALLS';
  from: string; // function/method id
  to: string;   // called function/method name
  filePath: string;
  line: number;
  callType?: 'direct' | 'method' | 'constructor';
}

export interface ContainsRelation {
  id: string;
  type: 'CONTAINS';
  from: string; // file or class id
  to: string;   // contained function/class id
}

// Milestone 4: Enhanced relationship types
export interface ReferenceRelation {
  id: string;
  type: 'REFERENCES';
  from: string; // referencing entity id
  to: string;   // referenced entity name
  filePath: string;
  line: number;
  referenceType: 'variable' | 'property' | 'type' | 'identifier';
}

export interface ImplementsRelation {
  id: string;
  type: 'IMPLEMENTS';
  from: string; // class id
  to: string;   // interface/base class name
  filePath: string;
}

export interface InstantiatesRelation {
  id: string;
  type: 'INSTANTIATES';
  from: string; // function/method id where instantiation occurs
  to: string;   // class/constructor name
  filePath: string;
  line: number;
}

export type CodeNode = FileNode | FunctionNode | ClassNode;
export type CodeRelation = ImportRelation | CallRelation | ContainsRelation | ReferenceRelation | ImplementsRelation | InstantiatesRelation;

export interface AnalysisResult {
  nodes: CodeNode[];
  relations: CodeRelation[];
  errors: string[];
}

/**
 * Static Code Analyzer for ContextAgent
 * Performs basic AST analysis to extract functions, classes, and relationships
 */
export class StaticAnalyzer {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = path.resolve(projectDir);
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      nodes: [],
      relations: [],
      errors: []
    };

    try {
      const absolutePath = path.resolve(this.projectDir, filePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      const stats = await fs.stat(absolutePath);
      
      // Create file node
      const fileNode: FileNode = {
        id: `file:${filePath}`,
        type: 'file',
        path: absolutePath,
        relativePath: filePath,
        language: this.detectLanguage(filePath),
        size: stats.size,
        lastModified: stats.mtime
      };
      result.nodes.push(fileNode);

      // Analyze based on file type
      if (this.isTypeScriptOrJavaScript(filePath)) {
        await this.analyzeTypeScriptFile(filePath, content, result);
      } else {
        // For non-TS/JS files, just do basic text analysis
        await this.analyzeTextFile(filePath, content, result);
      }

    } catch (error) {
      result.errors.push(`Failed to analyze ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Analyze multiple files and merge results
   */
  async analyzeFiles(filePaths: string[]): Promise<AnalysisResult> {
    const mergedResult: AnalysisResult = {
      nodes: [],
      relations: [],
      errors: []
    };

    for (const filePath of filePaths) {
      const result = await this.analyzeFile(filePath);
      mergedResult.nodes.push(...result.nodes);
      mergedResult.relations.push(...result.relations);
      mergedResult.errors.push(...result.errors);
    }

    return mergedResult;
  }

  /**
   * Analyze TypeScript/JavaScript file using AST
   */
  private async analyzeTypeScriptFile(
    filePath: string,
    content: string,
    result: AnalysisResult
  ): Promise<void> {
    try {
      // Parse the TypeScript/JavaScript file
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        this.getScriptKind(filePath)
      );

      // Visit all nodes in the AST
      this.visitNode(sourceFile, filePath, result);

    } catch (error) {
      result.errors.push(`TypeScript analysis failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Visit AST node and extract information
   */
  private visitNode(node: ts.Node, filePath: string, result: AnalysisResult): void {
    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
        this.analyzeFunctionDeclaration(node as ts.FunctionDeclaration, filePath, result);
        break;
      
      case ts.SyntaxKind.MethodDeclaration:
        this.analyzeMethodDeclaration(node as ts.MethodDeclaration, filePath, result);
        break;
      
      case ts.SyntaxKind.ClassDeclaration:
        this.analyzeClassDeclaration(node as ts.ClassDeclaration, filePath, result);
        break;
      
      case ts.SyntaxKind.ImportDeclaration:
        this.analyzeImportDeclaration(node as ts.ImportDeclaration, filePath, result);
        break;
      
      case ts.SyntaxKind.CallExpression:
        this.analyzeCallExpression(node as ts.CallExpression, filePath, result);
        break;
      
      case ts.SyntaxKind.NewExpression:
        this.analyzeNewExpression(node as ts.NewExpression, filePath, result);
        break;
      
      case ts.SyntaxKind.Identifier:
        this.analyzeIdentifier(node as ts.Identifier, filePath, result);
        break;
      
      case ts.SyntaxKind.PropertyAccessExpression:
        this.analyzePropertyAccess(node as ts.PropertyAccessExpression, filePath, result);
        break;
    }

    // Recursively visit child nodes
    ts.forEachChild(node, child => this.visitNode(child, filePath, result));
  }

  /**
   * Analyze function declaration
   */
  private analyzeFunctionDeclaration(
    node: ts.FunctionDeclaration,
    filePath: string,
    result: AnalysisResult
  ): void {
    if (!node.name) return;

    const sourceFile = node.getSourceFile();
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const functionNode: FunctionNode = {
      id: `function:${filePath}:${node.name.text}`,
      type: 'function',
      name: node.name.text,
      filePath,
      startLine: start.line + 1,
      endLine: end.line + 1,
      parameters: node.parameters.map(p => p.name?.getText() || '').filter(Boolean),
      isExported: this.hasExportModifier(node),
      isAsync: this.hasAsyncModifier(node)
    };

    result.nodes.push(functionNode);

    // Add CONTAINS relation
    result.relations.push({
      id: `contains:${filePath}:${functionNode.id}`,
      type: 'CONTAINS',
      from: `file:${filePath}`,
      to: functionNode.id
    });
  }

  /**
   * Analyze method declaration
   */
  private analyzeMethodDeclaration(
    node: ts.MethodDeclaration,
    filePath: string,
    result: AnalysisResult
  ): void {
    if (!node.name) return;

    const sourceFile = node.getSourceFile();
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    // Find parent class
    let parentClass: ts.ClassDeclaration | undefined;
    let current: ts.Node | undefined = node.parent;
    while (current && !ts.isClassDeclaration(current)) {
      current = current.parent;
    }
    if (current && ts.isClassDeclaration(current)) {
      parentClass = current;
    }

    const methodName = node.name.getText();
    const className = parentClass?.name?.text || 'Unknown';
    
    const methodNode: FunctionNode = {
      id: `method:${filePath}:${className}:${methodName}`,
      type: 'method',
      name: methodName,
      filePath,
      startLine: start.line + 1,
      endLine: end.line + 1,
      parameters: node.parameters.map(p => p.name?.getText() || '').filter(Boolean),
      isExported: false, // Methods are not directly exported
      isAsync: this.hasAsyncModifier(node),
      visibility: this.getVisibility(node)
    };

    result.nodes.push(methodNode);

    // Add CONTAINS relation to parent class if found
    if (parentClass?.name) {
      result.relations.push({
        id: `contains:${filePath}:${className}:${methodNode.id}`,
        type: 'CONTAINS',
        from: `class:${filePath}:${className}`,
        to: methodNode.id
      });
    }
  }

  /**
   * Analyze class declaration
   */
  private analyzeClassDeclaration(
    node: ts.ClassDeclaration,
    filePath: string,
    result: AnalysisResult
  ): void {
    if (!node.name) return;

    const sourceFile = node.getSourceFile();
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    const classNode: ClassNode = {
      id: `class:${filePath}:${node.name.text}`,
      type: 'class',
      name: node.name.text,
      filePath,
      startLine: start.line + 1,
      endLine: end.line + 1,
      isExported: this.hasExportModifier(node),
      methods: [],
      properties: [],
      extends: node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword)
        ?.types[0]?.expression?.getText(),
      implements: node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ImplementsKeyword)
        ?.types.map(t => t.expression.getText())
    };

    result.nodes.push(classNode);

    // Add CONTAINS relation
    result.relations.push({
      id: `contains:${filePath}:${classNode.id}`,
      type: 'CONTAINS',
      from: `file:${filePath}`,
      to: classNode.id
    });

    // Milestone 4: Add IMPLEMENTS relations for interfaces
    if (classNode.implements) {
      for (const interfaceName of classNode.implements) {
        const implementsRelation: ImplementsRelation = {
          id: `implements:${filePath}:${classNode.name}:${interfaceName}`,
          type: 'IMPLEMENTS',
          from: classNode.id,
          to: interfaceName,
          filePath
        };
        result.relations.push(implementsRelation);
      }
    }

    // Also handle extends relationship as a special case of implements
    if (classNode.extends) {
      const implementsRelation: ImplementsRelation = {
        id: `extends:${filePath}:${classNode.name}:${classNode.extends}`,
        type: 'IMPLEMENTS',
        from: classNode.id,
        to: classNode.extends,
        filePath
      };
      result.relations.push(implementsRelation);
    }
  }

  /**
   * Analyze import declaration
   */
  private analyzeImportDeclaration(
    node: ts.ImportDeclaration,
    filePath: string,
    result: AnalysisResult
  ): void {
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;

    const importPath = node.moduleSpecifier.text;
    const importedNames: string[] = [];
    let isDefault = false;

    if (node.importClause) {
      // Default import
      if (node.importClause.name) {
        importedNames.push(node.importClause.name.text);
        isDefault = true;
      }

      // Named imports
      if (node.importClause.namedBindings) {
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          node.importClause.namedBindings.elements.forEach(element => {
            importedNames.push(element.name.text);
          });
        } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          importedNames.push(node.importClause.namedBindings.name.text);
        }
      }
    }

    const importRelation: ImportRelation = {
      id: `import:${filePath}:${importPath}`,
      type: 'IMPORTS',
      from: filePath,
      to: importPath,
      importedNames,
      isDefault,
      isDynamic: false
    };

    result.relations.push(importRelation);
  }

  /**
   * Analyze call expression (Enhanced for Milestone 4)
   */
  private analyzeCallExpression(
    node: ts.CallExpression,
    filePath: string,
    result: AnalysisResult
  ): void {
    const sourceFile = node.getSourceFile();
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    // Extract function name and call type
    let functionName = '';
    let callType: 'direct' | 'method' | 'constructor' = 'direct';
    
    if (ts.isIdentifier(node.expression)) {
      functionName = node.expression.text;
      callType = 'direct';
    } else if (ts.isPropertyAccessExpression(node.expression)) {
      functionName = node.expression.name.text;
      callType = 'method';
    } else if (ts.isElementAccessExpression(node.expression)) {
      // Handle obj['method']() calls
      if (ts.isStringLiteral(node.expression.argumentExpression)) {
        functionName = node.expression.argumentExpression.text;
        callType = 'method';
      }
    }

    if (functionName) {
      // Find the containing function/method for this call
      let containingFunction = this.findContainingFunction(node);
      
      if (containingFunction) {
        const callRelation: CallRelation = {
          id: `call:${filePath}:${line}:${functionName}`,
          type: 'CALLS',
          from: containingFunction,
          to: functionName,
          filePath,
          line,
          callType
        };

        result.relations.push(callRelation);
      }
    }
  }

  /**
   * Analyze new expressions (constructor calls) - Milestone 4
   */
  private analyzeNewExpression(
    node: ts.NewExpression,
    filePath: string,
    result: AnalysisResult
  ): void {
    const sourceFile = node.getSourceFile();
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    let className = '';
    if (ts.isIdentifier(node.expression)) {
      className = node.expression.text;
    } else if (ts.isPropertyAccessExpression(node.expression)) {
      className = node.expression.name.text;
    }

    if (className) {
      const containingFunction = this.findContainingFunction(node);
      
      if (containingFunction) {
        const instantiatesRelation: InstantiatesRelation = {
          id: `instantiates:${filePath}:${line}:${className}`,
          type: 'INSTANTIATES',
          from: containingFunction,
          to: className,
          filePath,
          line
        };

        result.relations.push(instantiatesRelation);
      }
    }
  }

  /**
   * Analyze identifier references - Milestone 4
   */
  private analyzeIdentifier(
    node: ts.Identifier,
    filePath: string,
    result: AnalysisResult
  ): void {
    // Skip if this identifier is part of a declaration or call expression
    const parent = node.parent;
    if (!parent) return;
    
    // Skip declarations, function calls, property names, etc.
    if (ts.isFunctionDeclaration(parent) || 
        ts.isMethodDeclaration(parent) ||
        ts.isClassDeclaration(parent) ||
        ts.isCallExpression(parent) ||
        ts.isNewExpression(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isVariableDeclaration(parent) ||
        ts.isParameter(parent) ||
        ts.isPropertyAssignment(parent) ||
        ts.isPropertySignature(parent)) {
      return;
    }

    // This is likely a reference to a variable, function, or type
    const sourceFile = node.getSourceFile();
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const containingFunction = this.findContainingFunction(node);
    
    if (containingFunction && node.text) {
      const referenceRelation: ReferenceRelation = {
        id: `reference:${filePath}:${line}:${node.text}`,
        type: 'REFERENCES',
        from: containingFunction,
        to: node.text,
        filePath,
        line,
        referenceType: 'identifier'
      };

      result.relations.push(referenceRelation);
    }
  }

  /**
   * Analyze property access expressions - Milestone 4
   */
  private analyzePropertyAccess(
    node: ts.PropertyAccessExpression,
    filePath: string,
    result: AnalysisResult
  ): void {
    // Skip if this is part of a call expression (handled separately)
    if (ts.isCallExpression(node.parent)) {
      return;
    }

    const sourceFile = node.getSourceFile();
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const containingFunction = this.findContainingFunction(node);
    
    if (containingFunction && node.name) {
      const propertyName = node.name.text;
      const referenceRelation: ReferenceRelation = {
        id: `reference:${filePath}:${line}:${propertyName}`,
        type: 'REFERENCES',
        from: containingFunction,
        to: propertyName,
        filePath,
        line,
        referenceType: 'property'
      };

      result.relations.push(referenceRelation);
    }
  }

  /**
   * Basic text analysis for non-TypeScript files
   */
  private async analyzeTextFile(
    filePath: string,
    content: string,
    result: AnalysisResult
  ): Promise<void> {
    // For now, just track the file existence
    // Future: add language-specific parsers or regex-based analysis
  }

  /**
   * Helper methods
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript-react',
      '.js': 'javascript',
      '.jsx': 'javascript-react',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c-header',
      '.hpp': 'cpp-header',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.html': 'html',
      '.css': 'css',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.sh': 'shell',
      '.sql': 'sql'
    };

    return languageMap[ext] || 'text';
  }

  private isTypeScriptOrJavaScript(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
  }

  private getScriptKind(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts': return ts.ScriptKind.TS;
      case '.tsx': return ts.ScriptKind.TSX;
      case '.js': return ts.ScriptKind.JS;
      case '.jsx': return ts.ScriptKind.JSX;
      default: return ts.ScriptKind.Unknown;
    }
  }

  private hasExportModifier(node: ts.Node): boolean {
    const modifiers = (node as any).modifiers;
    return modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword) || false;
  }

  private hasAsyncModifier(node: ts.Node): boolean {
    const modifiers = (node as any).modifiers;
    return modifiers?.some((m: any) => m.kind === ts.SyntaxKind.AsyncKeyword) || false;
  }

  private getVisibility(node: ts.Node): 'public' | 'private' | 'protected' {
    const modifiers = (node as any).modifiers;
    if (modifiers?.some((m: any) => m.kind === ts.SyntaxKind.PrivateKeyword)) return 'private';
    if (modifiers?.some((m: any) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
    return 'public';
  }

  private findContainingFunction(node: ts.Node): string | undefined {
    let current = node.parent;
    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        return `function:${current.getSourceFile().fileName}:${current.name.text}`;
      }
      if (ts.isMethodDeclaration(current) && current.name) {
        // Find parent class
        let classNode: ts.Node | undefined = current.parent;
        while (classNode && !ts.isClassDeclaration(classNode)) {
          classNode = classNode.parent;
        }
        const classDeclaration = ts.isClassDeclaration(classNode) ? classNode : undefined;
        const className = (ts.isClassDeclaration(classNode) && classNode.name) ? classNode.name.text : 'Unknown';
        return `method:${current.getSourceFile().fileName}:${className}:${current.name.getText()}`;
      }
      current = current.parent;
    }
    return undefined;
  }
}