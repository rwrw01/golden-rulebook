import { describe, it, expect } from 'vitest';
import { classifyQuery } from './query-classifier.js';

describe('classifyQuery', () => {
  it('should detect actor intent from "wie moet ik informeren"', () => {
    const result = classifyQuery('Wie moet ik informeren bij een ESB storing?');
    expect(result.intents).toContain('actors');
    expect(result.systemNames).toContain('esb');
  });

  it('should detect process intent from "welke processen"', () => {
    const result = classifyQuery('Welke processen raakt een storing in Allegro?');
    expect(result.intents).toContain('processes');
    expect(result.systemNames).toContain('allegro');
  });

  it('should detect infra intent from "waar draait dit op"', () => {
    const result = classifyQuery('Waar draait de ESB op? Welke servers?');
    expect(result.intents).toContain('infra');
    expect(result.systemNames).toContain('esb');
  });

  it('should detect impact intent from "wat is de impact"', () => {
    const result = classifyQuery('Wat is de impact als Allegro uitvalt?');
    expect(result.intents).toContain('impact');
    expect(result.systemNames).toContain('allegro');
  });

  it('should detect multiple intents from compound questions', () => {
    const result = classifyQuery('ESB storing: wie informeren en welke processen geraakt?');
    expect(result.intents).toContain('actors');
    expect(result.intents).toContain('processes');
    expect(result.systemNames).toContain('esb');
  });

  it('should default to general for unclassifiable questions', () => {
    const result = classifyQuery('Hoeveel applicaties hebben we?');
    expect(result.intents).toContain('general');
    expect(result.systemNames).toHaveLength(0);
  });

  it('should extract multi-word system names', () => {
    const result = classifyQuery('Storing in Neuron ESB, wie bellen?');
    expect(result.systemNames).toContain('neuron esb');
    expect(result.intents).toContain('actors');
  });

  it('should detect intranet/communication intent', () => {
    const result = classifyQuery('Kan je een bericht voor intranet maken over de ESB storing?');
    expect(result.intents).toContain('communication');
    expect(result.systemNames).toContain('esb');
  });

  it('should handle combined question: storing + intranet + informeren', () => {
    const result = classifyQuery(
      'Ik heb een storing in de ESB. waar moet ik kijken en kan je een bericht voor intranet voor de gebruikers maken?'
    );
    expect(result.intents).toContain('impact');
    expect(result.intents).toContain('communication');
    expect(result.systemNames).toContain('esb');
  });

  it('should detect infra intent from "welke nodes"', () => {
    const result = classifyQuery('Welke nodes draaien de ESB?');
    expect(result.intents).toContain('infra');
    expect(result.systemNames).toContain('esb');
  });

  it('should detect infra intent from "welke database"', () => {
    const result = classifyQuery('Welke database gebruikt Allegro?');
    expect(result.intents).toContain('infra');
    expect(result.systemNames).toContain('allegro');
  });
});
